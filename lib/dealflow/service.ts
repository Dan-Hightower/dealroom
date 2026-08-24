import "server-only";

import { createHash } from "node:crypto";
import type {
	ChatPlatform,
	DealFlowSourceType,
	DealRoomMessageKind,
} from "@prisma/client";
import { type Credentials, getCredentials } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import {
	type ExtractionMessage,
	type ExtractionResult,
	extractDealRoomFacts,
	isExtractionConfigured,
} from "@/lib/dealflow/extract";
import {
	type DealRoomSyncInput,
	platformFromUrl,
} from "@/lib/dealflow/schemas";
import { parseWhatsAppExport } from "@/lib/dealflow/whatsapp-export";
import { readXConversation } from "@/lib/dealflow/x-chat";
import type { GrokAccess } from "@/lib/grok";

const SOURCE_TYPES = new Set<DealFlowSourceType>([
	"syndicate",
	"fund",
	"spv",
	"newsletter",
	"scout",
	"community",
	"other",
]);

const MAX_EXTRACTION_MESSAGES = 1200;

type ExtractionOutcome = {
	ran: boolean;
	reason?: string;
	members: number;
	startups: number;
	deals: number;
	sources: number;
	interests: number;
	holdings: number;
};

function skipped(reason: string): ExtractionOutcome {
	return {
		ran: false,
		reason,
		members: 0,
		startups: 0,
		deals: 0,
		sources: 0,
		interests: 0,
		holdings: 0,
	};
}

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

/**
 * The stable public name for a person on a platform: an @handle on X, a phone
 * number in E.164 on WhatsApp. The leading + is what tells the two apart
 * later, so it is always kept.
 */
function normalizeHandle(
	value?: string | null,
	platform: ChatPlatform = "x",
): string | undefined {
	const raw = value?.trim();
	if (!raw) return undefined;

	if (platform === "whatsapp") {
		const digits = raw.replace(/\D/g, "");
		// Shortest national numbers run to seven digits; E.164 caps at fifteen.
		return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : undefined;
	}

	const handle = raw.replace(/^@/, "").toLowerCase();
	return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : undefined;
}

/// Where to find someone, given only their handle.
export function profileUrlFor(handle: string, platform: ChatPlatform) {
	return platform === "whatsapp"
		? `https://wa.me/${handle.replace(/\D/g, "")}`
		: `https://x.com/${handle}`;
}

/// Names are messy, so collapse to letters and digits before comparing.
function slugKey(value?: string | null): string | undefined {
	const slug = value
		?.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || undefined;
}

function identityKeyFor(
	input: {
		handle?: string | null;
		name?: string | null;
	},
	platform: ChatPlatform = "x",
): string | undefined {
	const handle = normalizeHandle(input.handle, platform);
	if (handle) return `h:${handle}`;

	const slug = slugKey(input.name);
	return slug ? `n:${slug}` : undefined;
}

export function normalizeChatUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		url.hash = "";
		url.search = "";
		return url.toString().replace(/\/$/, "");
	} catch {
		return rawUrl.split("#")[0] ?? rawUrl;
	}
}

function parseDate(value?: string | null): Date | undefined {
	if (!value) return undefined;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function messageFingerprint(
	message: {
		authorHandle?: string | null;
		externalId?: string | null;
		kind: string;
		sentAtIso?: string | null;
		sentAtLabel?: string | null;
		sentAtExact?: boolean;
		text: string;
	},
	platform: ChatPlatform = "x",
): string {
	// A WhatsApp export carries no message id, so identity has to come from
	// what the file does show: author, minute and text. Two identical messages
	// from one person inside the same minute merge, which is the price of
	// re-importing an overlapping export without duplicating everything.
	if (platform === "whatsapp") {
		return hash(
			[
				message.kind,
				message.authorHandle ?? "",
				message.sentAtIso?.slice(0, 16) ?? "",
				message.text,
			].join("|"),
		);
	}

	// X gives every message a uuid. Prefer it: hashing author + time + text
	// collapses two identical messages sent in the same minute.
	if (message.externalId) return `x:${message.externalId}`;

	// Without one, fall back to a hash — but on the clock time only, never the
	// day. Fixing how a day is read must not change the identity of a message
	// that was already stored, or every correction arrives as a duplicate.
	const clock = (message.sentAtLabel ?? "").match(
		/\b\d{1,2}:\d{2}\s*(am|pm)?/i,
	);

	return hash(
		[
			message.kind,
			message.authorHandle ?? "",
			clock?.[0] ?? "",
			message.text,
		].join("|"),
	);
}

/// Never overwrite something already recorded; the chat is append-only truth.
function coalesce<T>(
	current: T | null | undefined,
	next: T | null | undefined,
) {
	return current ?? next ?? null;
}

/** Confirms the room belongs to this user before anything touches it. */
/// Whose model key pays for extraction. Everyone brings their own.
function grokAccess(credentials: Credentials): GrokAccess | null {
	return credentials.xaiApiKey ? { apiKey: credentials.xaiApiKey } : null;
}

async function assertOwnedRoom(userId: string, roomId: string) {
	const room = await prisma.dealRoom.findFirst({
		where: { id: roomId, userId },
		select: { id: true, name: true, platform: true },
	});
	return room;
}

async function upsertMembers(input: {
	roomId: string;
	platform: ChatPlatform;
	people: Array<{
		handle?: string | null;
		name?: string | null;
		profileUrl?: string | null;
	}>;
}) {
	const byKey = new Map<
		string,
		{ handle?: string; name?: string; profileUrl?: string }
	>();

	for (const person of input.people) {
		const key = identityKeyFor(person, input.platform);
		if (!key) continue;

		const handle = normalizeHandle(person.handle, input.platform);
		const existing = byKey.get(key) ?? {};

		byKey.set(key, {
			handle: handle ?? existing.handle,
			name: person.name?.trim() || existing.name,
			profileUrl:
				person.profileUrl?.trim() ||
				existing.profileUrl ||
				(handle ? profileUrlFor(handle, input.platform) : undefined),
		});
	}

	const members = new Map<string, string>();

	for (const [identityKey, person] of byKey) {
		const member = await prisma.dealRoomMember.upsert({
			where: { roomId_identityKey: { roomId: input.roomId, identityKey } },
			create: {
				roomId: input.roomId,
				identityKey,
				name: person.name ?? null,
				handle: person.handle ?? null,
				profileUrl:
					person.profileUrl ??
					(person.handle ? `https://x.com/${person.handle}` : null),
			},
			update: {
				name: person.name ?? undefined,
				handle: person.handle ?? undefined,
				profileUrl: person.profileUrl ?? undefined,
			},
			select: { id: true, identityKey: true },
		});

		members.set(member.identityKey, member.id);
	}

	return members;
}

/**
 * Writes corrected timestamps onto messages already stored.
 *
 * createMany(skipDuplicates) leaves an existing row exactly as it was first
 * written, so a message whose day the parser once misread would keep that day
 * for good. Every re-sync re-reads the thread anyway, so treat the fresh read
 * as the better one and repair what has drifted. Returns how many changed,
 * which is zero on a normal sync.
 */
async function repairMessageDates(
	roomId: string,
	rows: {
		fingerprint: string;
		sentAt: Date | null;
		sentAtLabel: string | null;
	}[],
) {
	const dated = rows.filter((row) => row.sentAt);
	if (!dated.length) return 0;

	const stored = await prisma.dealRoomMessage.findMany({
		where: { roomId, fingerprint: { in: dated.map((row) => row.fingerprint) } },
		select: { id: true, fingerprint: true, sentAt: true },
	});

	const byFingerprint = new Map(stored.map((row) => [row.fingerprint, row]));

	const stale = dated.flatMap((row) => {
		const existing = byFingerprint.get(row.fingerprint);
		const changed =
			existing && existing.sentAt?.getTime() !== row.sentAt?.getTime();

		return changed && row.sentAt
			? [{ id: existing.id, sentAt: row.sentAt, sentAtLabel: row.sentAtLabel }]
			: [];
	});

	for (let index = 0; index < stale.length; index += 25) {
		await Promise.all(
			stale.slice(index, index + 25).map((row) =>
				prisma.dealRoomMessage.update({
					where: { id: row.id },
					data: { sentAt: row.sentAt, sentAtLabel: row.sentAtLabel },
				}),
			),
		);
	}

	return stale.length;
}

async function refreshMemberStats(roomId: string) {
	const grouped = await prisma.dealRoomMessage.groupBy({
		by: ["memberId"],
		where: { roomId, memberId: { not: null }, kind: "message" },
		_count: { _all: true },
		_min: { sentAt: true },
		_max: { sentAt: true },
	});

	for (const row of grouped) {
		if (!row.memberId) continue;

		await prisma.dealRoomMember.update({
			where: { id: row.memberId },
			data: {
				messageCount: row._count._all,
				firstSeenAt: row._min.sentAt ?? undefined,
				lastSeenAt: row._max.sentAt ?? undefined,
			},
		});
	}
}

/// "Alice joined" style rows are the only reliable join date X gives us.
/// `refresh` recomputes dates already recorded, for when the ones underneath
/// them have been corrected.
async function applyJoinEvents(
	roomId: string,
	platform: ChatPlatform,
	refresh = false,
) {
	const [joinEvents, members] = await Promise.all([
		prisma.dealRoomMessage.findMany({
			where: { roomId, kind: "join" },
			orderBy: { sequence: "asc" },
			select: { text: true, sentAt: true },
		}),
		prisma.dealRoomMember.findMany({
			where: { roomId },
			select: { id: true, name: true, handle: true, joinedAt: true },
		}),
	]);

	if (!joinEvents.length) return;

	for (const member of members) {
		if (member.joinedAt && !refresh) continue;

		const handle = normalizeHandle(member.handle, platform);
		const name = member.name?.trim().toLowerCase();

		const match = joinEvents.find((event) => {
			const text = event.text.toLowerCase();

			// WhatsApp writes a number the way its country does — "+1 (202)
			// 555-0123" — so the digits are the only part that lines up with a
			// stored E.164 handle.
			if (handle) {
				const found =
					platform === "whatsapp"
						? text.replace(/\D/g, "").includes(handle.replace(/\D/g, ""))
						: text.includes(`@${handle}`);
				if (found) return true;
			}

			return Boolean(name && name.length > 2 && text.includes(name));
		});

		if (!match?.sentAt) continue;

		await prisma.dealRoomMember.update({
			where: { id: member.id },
			data: { joinedAt: match.sentAt },
		});
	}
}

async function persistExtraction(input: {
	roomId: string;
	platform: ChatPlatform;
	result: ExtractionResult;
	messageIndex: Map<string, { id: string; sentAt: Date | null }>;
	memberIdByKey: Map<string, string>;
}) {
	const { roomId, platform, result, messageIndex, memberIdByKey } = input;

	const resolveMessage = (ref?: string | null) =>
		ref ? (messageIndex.get(ref) ?? null) : null;

	const resolveMember = (person: {
		handle?: string | null;
		name?: string | null;
	}) => {
		const key = identityKeyFor(person, platform);
		return key ? (memberIdByKey.get(key) ?? null) : null;
	};

	let memberUpdates = 0;

	for (const member of result.members) {
		const key = identityKeyFor(
			{ handle: member.handle, name: member.name },
			platform,
		);
		const memberId = key ? memberIdByKey.get(key) : undefined;
		if (!memberId) continue;

		const current = await prisma.dealRoomMember.findUnique({
			where: { id: memberId },
			select: { bio: true, email: true, name: true },
		});
		if (!current) continue;

		const data = {
			bio: coalesce(current.bio, member.bio),
			email: coalesce(current.email, member.email),
			name: coalesce(current.name, member.name),
		};

		if (
			data.bio === current.bio &&
			data.email === current.email &&
			data.name === current.name
		) {
			continue;
		}

		await prisma.dealRoomMember.update({ where: { id: memberId }, data });
		memberUpdates += 1;
	}

	const startupIdByKey = new Map<string, string>();

	for (const startup of result.startups) {
		const key = identityKeyFor({ handle: startup.xHandle, name: startup.name });
		if (!key || !startup.name?.trim()) continue;

		const record = await prisma.dealStartup.upsert({
			where: { roomId_identityKey: { roomId, identityKey: key } },
			create: {
				roomId,
				identityKey: key,
				name: startup.name.trim(),
				xHandle: normalizeHandle(startup.xHandle) ?? null,
				website: startup.website?.trim() || null,
				description: startup.description?.trim() || null,
				sector: startup.sector?.trim() || null,
				mentionCount: 1,
			},
			update: {
				xHandle: normalizeHandle(startup.xHandle) ?? undefined,
				website: startup.website?.trim() || undefined,
				description: startup.description?.trim() || undefined,
				sector: startup.sector?.trim() || undefined,
				mentionCount: { increment: 1 },
			},
			select: { id: true },
		});

		startupIdByKey.set(key, record.id);
		// Also index by bare name so deals can find the startup by label alone.
		const nameKey = slugKey(startup.name);
		if (nameKey) startupIdByKey.set(`n:${nameKey}`, record.id);
	}

	const dealIdByStartupKey = new Map<string, string>();
	let dealCount = 0;

	for (const deal of result.deals) {
		const nameKey = slugKey(deal.startupName);
		if (!nameKey) continue;

		let startupId = startupIdByKey.get(`n:${nameKey}`);

		if (!startupId) {
			// The model named a startup in a deal it never described. Create a stub
			// so the deal is still recorded against something.
			const created = await prisma.dealStartup.upsert({
				where: { roomId_identityKey: { roomId, identityKey: `n:${nameKey}` } },
				create: {
					roomId,
					identityKey: `n:${nameKey}`,
					name: deal.startupName.trim(),
				},
				update: {},
				select: { id: true },
			});
			startupId = created.id;
			startupIdByKey.set(`n:${nameKey}`, created.id);
		}

		const sourceMessage = resolveMessage(deal.messageRef);
		const fingerprint = hash(
			[
				nameKey,
				normalizeHandle(deal.sharedByHandle, platform) ?? "",
				deal.messageRef ?? deal.blurb ?? "",
			].join("|"),
		);

		const record = await prisma.deal.upsert({
			where: { roomId_fingerprint: { roomId, fingerprint } },
			create: {
				roomId,
				startupId,
				fingerprint,
				sharedById: resolveMember({
					handle: deal.sharedByHandle,
					name: deal.sharedByName,
				}),
				sharedByHandle: normalizeHandle(deal.sharedByHandle, platform) ?? null,
				sharedByName: deal.sharedByName?.trim() || null,
				blurb: deal.blurb?.trim() || null,
				terms: deal.terms?.trim() || null,
				roundStage: deal.roundStage?.trim() || null,
				url: deal.url?.trim() || null,
				sharedAt: sourceMessage?.sentAt ?? null,
				sourceMessageId: sourceMessage?.id ?? null,
			},
			update: {
				blurb: deal.blurb?.trim() || undefined,
				terms: deal.terms?.trim() || undefined,
				roundStage: deal.roundStage?.trim() || undefined,
				url: deal.url?.trim() || undefined,
				// The message this came from may since have had its date
				// corrected, and the deal is dated from it.
				sharedAt: sourceMessage?.sentAt ?? undefined,
			},
			select: { id: true },
		});

		dealIdByStartupKey.set(nameKey, record.id);
		dealCount += 1;

		if (sourceMessage?.sentAt) {
			await prisma.dealStartup.update({
				where: { id: startupId },
				data: { lastMentionedAt: sourceMessage.sentAt },
			});
			// firstMentionedAt is a floor, so only fill it while it is still empty.
			await prisma.dealStartup.updateMany({
				where: { id: startupId, firstMentionedAt: null },
				data: { firstMentionedAt: sourceMessage.sentAt },
			});
		}
	}

	let holdingCount = 0;

	for (const holding of result.holdings) {
		const nameKey = slugKey(holding.startupName);
		const memberId = resolveMember({
			handle: holding.personHandle,
			name: holding.personName,
		});
		if (!nameKey || !memberId) continue;

		// Only attach to a startup the room already knows about, so a garbled
		// name does not invent a company.
		const startupId = startupIdByKey.get(`n:${nameKey}`);
		if (!startupId) continue;

		const sourceMessage = resolveMessage(holding.messageRef);

		await prisma.startupHolding.upsert({
			where: {
				roomId_fingerprint: {
					roomId,
					fingerprint: hash([nameKey, memberId].join("|")),
				},
			},
			create: {
				roomId,
				startupId,
				memberId,
				fingerprint: hash([nameKey, memberId].join("|")),
				note: holding.note?.trim() || null,
				claimedAt: sourceMessage?.sentAt ?? null,
				sourceMessageId: sourceMessage?.id ?? null,
			},
			update: {
				note: holding.note?.trim() || undefined,
				claimedAt: sourceMessage?.sentAt ?? undefined,
			},
		});

		holdingCount += 1;
	}

	const sourceIdByKey = new Map<string, string>();

	for (const source of result.sources) {
		const nameKey = slugKey(source.name);
		if (!nameKey || !source.name?.trim()) continue;

		const sourceMessage = resolveMessage(source.messageRef);
		const type = SOURCE_TYPES.has(source.type as DealFlowSourceType)
			? (source.type as DealFlowSourceType)
			: "other";

		const record = await prisma.dealFlowSource.upsert({
			where: { roomId_identityKey: { roomId, identityKey: `n:${nameKey}` } },
			create: {
				roomId,
				identityKey: `n:${nameKey}`,
				name: source.name.trim(),
				type,
				description: source.description?.trim() || null,
				url: source.url?.trim() || null,
				runById: resolveMember({
					handle: source.runByHandle,
					name: source.runByName,
				}),
				runByHandle: normalizeHandle(source.runByHandle, platform) ?? null,
				runByName: source.runByName?.trim() || null,
				sharedAt: sourceMessage?.sentAt ?? null,
				sourceMessageId: sourceMessage?.id ?? null,
			},
			update: {
				description: source.description?.trim() || undefined,
				url: source.url?.trim() || undefined,
				runByHandle: normalizeHandle(source.runByHandle, platform) ?? undefined,
				runByName: source.runByName?.trim() || undefined,
				sharedAt: sourceMessage?.sentAt ?? undefined,
			},
			select: { id: true },
		});

		sourceIdByKey.set(nameKey, record.id);
	}

	let interestCount = 0;

	for (const interest of result.interests) {
		const targetKey = slugKey(interest.targetName);
		if (!targetKey) continue;

		const dealId =
			interest.targetType === "deal"
				? (dealIdByStartupKey.get(targetKey) ?? null)
				: null;
		const startupId =
			interest.targetType === "deal"
				? (startupIdByKey.get(`n:${targetKey}`) ?? null)
				: null;
		const dealFlowSourceId =
			interest.targetType === "source"
				? (sourceIdByKey.get(targetKey) ?? null)
				: null;

		if (!dealId && !startupId && !dealFlowSourceId) continue;

		const sourceMessage = resolveMessage(interest.messageRef);
		const personHandle = normalizeHandle(interest.personHandle, platform);
		const fingerprint = hash(
			[
				interest.targetType,
				targetKey,
				personHandle ?? slugKey(interest.personName) ?? "",
				interest.messageRef ?? "",
			].join("|"),
		);

		await prisma.dealInterest.upsert({
			where: { roomId_fingerprint: { roomId, fingerprint } },
			create: {
				roomId,
				fingerprint,
				dealId,
				startupId,
				dealFlowSourceId,
				memberId: resolveMember({
					handle: interest.personHandle,
					name: interest.personName,
				}),
				personName: interest.personName?.trim() || null,
				personHandle: personHandle ?? null,
				personEmail: interest.personEmail?.trim() || null,
				note: interest.note?.trim() || null,
				expressedAt: sourceMessage?.sentAt ?? null,
				sourceMessageId: sourceMessage?.id ?? null,
			},
			update: {
				personEmail: interest.personEmail?.trim() || undefined,
				note: interest.note?.trim() || undefined,
				expressedAt: sourceMessage?.sentAt ?? undefined,
			},
		});

		interestCount += 1;
	}

	return {
		members: memberUpdates,
		startups: startupIdByKey.size,
		deals: dealCount,
		sources: sourceIdByKey.size,
		interests: interestCount,
		holdings: holdingCount,
	};
}

export async function runDealRoomExtraction(input: {
	userId: string;
	roomId: string;
	full?: boolean;
}): Promise<ExtractionOutcome> {
	const room = await assertOwnedRoom(input.userId, input.roomId);
	if (!room) return skipped("Room not found");

	const access = grokAccess(await getCredentials(input.userId));

	if (!access || !isExtractionConfigured(access)) {
		return skipped("No model key. Add one in Settings.");
	}

	try {
		// A pending migration shows up as a confusing extraction failure, so
		// check for it plainly before doing any work.
		await prisma.startupHolding.count({ where: { roomId: room.id } });
	} catch {
		return skipped(
			"Database is missing a table. Run npm run setup to apply migrations.",
		);
	}

	const messages = await prisma.dealRoomMessage.findMany({
		where: { roomId: room.id, ...(input.full ? {} : { processedAt: null }) },
		orderBy: [{ sentAt: "asc" }, { sequence: "asc" }],
		take: MAX_EXTRACTION_MESSAGES,
		select: {
			id: true,
			authorHandle: true,
			authorName: true,
			kind: true,
			sentAt: true,
			sentAtLabel: true,
			text: true,
		},
	});

	if (!messages.length) return skipped("No new messages to read");

	const members = await prisma.dealRoomMember.findMany({
		where: { roomId: room.id },
		select: { id: true, identityKey: true },
	});

	const result = await extractDealRoomFacts({
		access,
		roomName: room.name,
		messages: messages as ExtractionMessage[],
	});

	const counts = await persistExtraction({
		roomId: room.id,
		platform: room.platform,
		result,
		messageIndex: new Map(
			messages.map((message) => [
				message.id,
				{ id: message.id, sentAt: message.sentAt },
			]),
		),
		memberIdByKey: new Map(
			members.map((member) => [member.identityKey, member.id]),
		),
	});

	await prisma.dealRoomMessage.updateMany({
		where: { id: { in: messages.map((message) => message.id) } },
		data: { processedAt: new Date() },
	});

	await prisma.dealRoom.update({
		where: { id: room.id },
		data: { lastExtractedAt: new Date() },
	});

	return { ran: true, ...counts };
}

/**
 * Finds the chat a batch of messages belongs to.
 *
 * On X the URL identifies the conversation. On WhatsApp every chat is served
 * from web.whatsapp.com, so the URL says nothing — the group's own id does,
 * and a chat that arrived as an exported file does not have one, because the
 * export never mentions it. That leaves the group name, which is what the
 * person reading the app sees and can correct. Once a live read matches a
 * room by name its id is written down, and the name never decides again.
 */
async function findRoom(input: {
	userId: string;
	platform: ChatPlatform;
	chatUrl: string;
	conversationId?: string;
	title?: string;
}) {
	const { userId, platform, chatUrl, conversationId, title } = input;

	if (conversationId) {
		const byId = await prisma.dealRoom.findFirst({
			where: { userId, conversationId },
			select: { id: true },
		});
		if (byId) return byId;
	}

	if (platform !== "whatsapp") {
		return prisma.dealRoom.findFirst({
			where: { userId, chatUrl },
			select: { id: true },
		});
	}

	return title
		? prisma.dealRoom.findFirst({
				where: {
					userId,
					platform: "whatsapp",
					conversationId: null,
					name: { equals: title, mode: "insensitive" },
				},
				select: { id: true },
			})
		: null;
}

export async function syncDealRoom(input: {
	userId: string;
	payload: DealRoomSyncInput;
}) {
	const { userId, payload } = input;
	const chatUrl = normalizeChatUrl(payload.chatUrl);
	// The URL is the more reliable of the two: a reader can be told the wrong
	// platform, but it cannot be reading a host it is not on.
	const platform = platformFromUrl(chatUrl);

	const existing = await findRoom({
		userId,
		platform,
		chatUrl,
		conversationId: payload.conversationId,
		title: payload.title,
	});

	const room = existing
		? await prisma.dealRoom.update({
				where: { id: existing.id },
				data: {
					chatUrl,
					name: payload.title || undefined,
					platform,
					conversationId: payload.conversationId || undefined,
					lastSyncedAt: new Date(),
					lastSyncError: null,
				},
				select: { id: true, name: true, platform: true },
			})
		: await prisma.dealRoom.create({
				data: {
					userId,
					chatUrl,
					name: payload.title || "Untitled deal room",
					platform,
					conversationId: payload.conversationId || null,
					lastSyncedAt: new Date(),
				},
				select: { id: true, name: true, platform: true },
			});

	return ingest({
		userId,
		room,
		platform,
		participants: payload.participants,
		messages: payload.messages,
		reachedStart: payload.reachedStart,
	});
}

/**
 * Pulls a room's X conversation through the Chat API.
 *
 * This is what Refresh does: the API hands over the messages with real ids and
 * real timestamps, and pages the history rather than making anyone scroll it.
 */
export async function syncXRoom(input: {
	userId: string;
	roomId: string;
	maxEvents?: number;
}) {
	const room = await prisma.dealRoom.findFirst({
		where: { id: input.roomId, userId: input.userId },
		select: {
			id: true,
			name: true,
			platform: true,
			conversationId: true,
			chatUrl: true,
		},
	});

	if (!room) throw new Error("Room not found");

	if (room.platform !== "x") {
		throw new Error(
			"That chat is not on X. WhatsApp history comes from an exported file.",
		);
	}

	// The conversation id is what the API addresses; an x.com URL ends in it.
	const conversationId =
		room.conversationId ||
		room.chatUrl?.split("/").filter(Boolean).at(-1) ||
		"";

	if (!conversationId) {
		throw new Error(
			"This chat has no X conversation id. Pick it again from the chat list.",
		);
	}

	const credentials = await getCredentials(input.userId);

	try {
		const read = await readXConversation({
			credentials,
			conversationId,
			maxEvents: input.maxEvents,
		});

		const result = await ingest({
			userId: input.userId,
			room,
			platform: "x",
			participants: read.participants,
			messages: read.messages,
			reachedStart: read.reachedStart,
		});

		await prisma.dealRoom.update({
			where: { id: room.id },
			data: {
				conversationId,
				name: read.title || undefined,
				lastSyncedAt: new Date(),
				lastSyncError: null,
			},
		});

		return { ...result, undecrypted: read.undecrypted };
	} catch (error) {
		const reason = error instanceof Error ? error.message : "Sync failed";
		await prisma.dealRoom.update({
			where: { id: room.id },
			data: { lastSyncError: reason },
		});
		throw error;
	}
}

/**
 * Loads a chat exported from WhatsApp into a room.
 *
 * WhatsApp has no API that will hand over a group you are in, so an exported
 * file is the only way its history gets here at all.
 */
export async function importChatExport(input: {
	userId: string;
	/** An existing room to add to. Omitted, a new one is created. */
	roomId?: string;
	name?: string;
	text: string;
	/** The zone the export was written in, from the browser doing the upload. */
	timeZone?: string;
}) {
	const parsed = parseWhatsAppExport(input.text, input.timeZone);

	if (!parsed.messages.length) {
		throw new Error(
			"No messages found. Export a chat from WhatsApp with 'Without media' and upload the .txt file it produces.",
		);
	}

	const room = input.roomId
		? await assertOwnedRoom(input.userId, input.roomId)
		: await prisma.dealRoom.create({
				data: {
					userId: input.userId,
					name: input.name?.trim() || "Imported chat",
					platform: "whatsapp",
					lastSyncedAt: new Date(),
				},
				select: { id: true, name: true, platform: true },
			});

	if (!room) throw new Error("Room not found");

	const result = await ingest({
		userId: input.userId,
		room,
		platform: room.platform,
		reachedStart: true,
		participants: parsed.participants,
		messages: parsed.messages.map((message) => ({
			authorHandle: message.authorHandle,
			authorName: message.authorName,
			kind: message.kind,
			sentAtIso: message.sentAt.toISOString(),
			sentAtLabel: message.sentAtLabel,
			sequence: message.sequence,
			text: message.text,
		})),
	});

	await prisma.dealRoom.update({
		where: { id: room.id },
		data: { lastSyncedAt: new Date() },
	});

	return { ...result, skippedLines: parsed.skipped };
}

/**
 * Stores a batch of messages against a room and re-reads what changed.
 *
 * Both sources land here: the X Chat API and an exported WhatsApp file.
 * Neither knows anything the other does not by this point — a message is an
 * author, a time and some text — so dedupe, member stats, join dates and
 * extraction are all decided in one place.
 */
async function ingest(input: {
	userId: string;
	room: { id: string; name: string };
	platform: ChatPlatform;
	participants: DealRoomSyncInput["participants"];
	messages: DealRoomSyncInput["messages"];
	/** False when the reader gave up before the first message in the chat. */
	reachedStart: boolean;
}) {
	const { userId, room, platform, participants, messages, reachedStart } =
		input;
	const payload = { participants, messages, reachedStart };

	const memberIdByKey = await upsertMembers({
		roomId: room.id,
		platform,
		people: [
			...payload.participants,
			...payload.messages.map((message) => ({
				handle: message.authorHandle,
				name: message.authorName,
			})),
		],
	});

	const rows = payload.messages.map((message) => {
		const identityKey = identityKeyFor(
			{ handle: message.authorHandle, name: message.authorName },
			platform,
		);

		return {
			roomId: room.id,
			memberId: identityKey ? (memberIdByKey.get(identityKey) ?? null) : null,
			fingerprint: messageFingerprint(message, platform),
			kind: message.kind as DealRoomMessageKind,
			authorHandle: message.authorHandle ?? null,
			authorName: message.authorName ?? null,
			text: message.text,
			sentAt: parseDate(message.sentAtIso) ?? null,
			sentAtLabel: message.sentAtLabel ?? null,
			sequence: message.sequence,
		};
	});

	const inserted = await prisma.dealRoomMessage.createMany({
		data: rows,
		skipDuplicates: true,
	});

	const repaired = await repairMessageDates(room.id, rows);

	await refreshMemberStats(room.id);
	await applyJoinEvents(room.id, platform, repaired > 0);

	const [totalMessages, latest] = await Promise.all([
		prisma.dealRoomMessage.count({ where: { roomId: room.id } }),
		prisma.dealRoomMessage.findFirst({
			where: { roomId: room.id, sentAt: { not: null } },
			orderBy: { sentAt: "desc" },
			select: { sentAt: true },
		}),
	]);

	let extraction = skipped("Extraction skipped");

	try {
		extraction = await runDealRoomExtraction({
			userId,
			roomId: room.id,
			// Dates that moved change what every extracted record is stamped
			// with, and only a full pass revisits messages already read.
			full: repaired > 0,
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : "Extraction failed";
		console.error("Deal room extraction failed:", reason);
		await prisma.dealRoom.update({
			where: { id: room.id },
			data: { lastSyncError: reason },
		});
		// Surface the real reason. A generic message here sends people hunting
		// through server logs for what is usually a one line fix.
		extraction = skipped(`Extraction failed: ${reason.slice(0, 300)}`);
	}

	await prisma.dealRoom.update({
		where: { id: room.id },
		data: {
			messageCount: totalMessages,
			lastMessageAt: latest?.sentAt ?? undefined,
		},
	});

	return {
		roomId: room.id,
		roomName: room.name,
		newMessages: inserted.count,
		totalMessages,
		// Messages already stored whose date this pass corrected. Non-zero
		// after a parser fix, zero on an ordinary sync.
		repairedDates: repaired,
		// False means X still had older history when we stopped scrolling.
		reachedStart: payload.reachedStart,
		extraction,
	};
}
