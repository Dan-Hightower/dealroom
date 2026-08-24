import "server-only";

import { prisma } from "@/lib/db";

/** Resolves which room to show: the one asked for, else the newest. */
async function resolveRoomId(userId: string, roomId?: string) {
	const room = await prisma.dealRoom.findFirst({
		where: { userId, ...(roomId ? { id: roomId } : {}) },
		orderBy: [{ lastSyncedAt: "desc" }, { createdAt: "desc" }],
		select: { id: true },
	});
	return room?.id ?? null;
}

export async function listRooms(userId: string) {
	return prisma.dealRoom.findMany({
		where: { userId },
		orderBy: [{ lastSyncedAt: "desc" }, { createdAt: "desc" }],
		select: {
			id: true,
			name: true,
			platform: true,
			chatUrl: true,
			messageCount: true,
			lastSyncedAt: true,
			lastExtractedAt: true,
			lastSyncError: true,
			_count: {
				select: {
					members: true,
					startups: true,
					deals: true,
					sources: true,
					interests: true,
				},
			},
		},
	});
}

export async function getOverview(userId: string, roomId?: string) {
	const id = await resolveRoomId(userId, roomId);
	if (!id) return null;

	const [room, recentDeals, recentInterests] = await Promise.all([
		prisma.dealRoom.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				chatUrl: true,
				messageCount: true,
				lastSyncedAt: true,
				lastExtractedAt: true,
				_count: {
					select: {
						members: true,
						startups: true,
						deals: true,
						sources: true,
						interests: true,
					},
				},
			},
		}),
		prisma.deal.findMany({
			where: { roomId: id },
			orderBy: [{ sharedAt: "desc" }, { createdAt: "desc" }],
			take: 10,
			select: {
				id: true,
				blurb: true,
				sharedAt: true,
				sharedByHandle: true,
				sharedByName: true,
				startup: { select: { name: true } },
				_count: { select: { interests: true } },
			},
		}),
		prisma.dealInterest.findMany({
			where: { roomId: id },
			orderBy: [{ expressedAt: "desc" }, { createdAt: "desc" }],
			take: 10,
			select: {
				id: true,
				personName: true,
				personHandle: true,
				personEmail: true,
				note: true,
				expressedAt: true,
				startup: { select: { name: true } },
				dealFlowSource: { select: { name: true } },
			},
		}),
	]);

	return room ? { room, recentDeals, recentInterests } : null;
}

type ListArgs = { userId: string; roomId?: string; search?: string };

function contains(search?: string) {
	return search
		? { contains: search, mode: "insensitive" as const }
		: undefined;
}

export async function listMembers({ userId, roomId, search }: ListArgs) {
	const id = await resolveRoomId(userId, roomId);
	if (!id) return [];

	return prisma.dealRoomMember.findMany({
		where: {
			roomId: id,
			...(search
				? {
						OR: [
							{ name: contains(search) },
							{ handle: contains(search) },
							{ bio: contains(search) },
							{ email: contains(search) },
						],
					}
				: {}),
		},
		orderBy: [{ joinedAt: "asc" }, { firstSeenAt: "asc" }, { name: "asc" }],
		take: 500,
		select: {
			id: true,
			name: true,
			handle: true,
			bio: true,
			email: true,
			joinedAt: true,
			firstSeenAt: true,
			messageCount: true,
			holdings: {
				take: 12,
				select: { id: true, startup: { select: { id: true, name: true } } },
			},
			_count: {
				select: { sharedDeals: true, holdings: true, interests: true },
			},
		},
	});
}

export async function listStartups({ userId, roomId, search }: ListArgs) {
	const id = await resolveRoomId(userId, roomId);
	if (!id) return [];

	return prisma.dealStartup.findMany({
		where: {
			roomId: id,
			...(search
				? {
						OR: [
							{ name: contains(search) },
							{ xHandle: contains(search) },
							{ description: contains(search) },
							{ sector: contains(search) },
						],
					}
				: {}),
		},
		orderBy: [{ lastMentionedAt: "desc" }, { name: "asc" }],
		take: 500,
		select: {
			id: true,
			name: true,
			xHandle: true,
			website: true,
			description: true,
			sector: true,
			lastMentionedAt: true,
			deals: {
				orderBy: { sharedAt: "desc" },
				take: 5,
				select: { id: true, sharedByHandle: true, sharedByName: true },
			},
			holdings: {
				take: 10,
				select: {
					id: true,
					member: { select: { name: true, handle: true } },
				},
			},
			_count: { select: { deals: true, holdings: true, interests: true } },
		},
	});
}

export async function listDeals({ userId, roomId, search }: ListArgs) {
	const id = await resolveRoomId(userId, roomId);
	if (!id) return [];

	return prisma.deal.findMany({
		where: {
			roomId: id,
			...(search
				? {
						OR: [
							{ blurb: contains(search) },
							{ startup: { name: contains(search) } },
						],
					}
				: {}),
		},
		orderBy: [{ sharedAt: "desc" }, { createdAt: "desc" }],
		take: 500,
		select: {
			id: true,
			blurb: true,
			terms: true,
			roundStage: true,
			url: true,
			sharedAt: true,
			sharedByHandle: true,
			sharedByName: true,
			startup: { select: { id: true, name: true, xHandle: true } },
			interests: {
				orderBy: { expressedAt: "desc" },
				take: 50,
				select: {
					id: true,
					personName: true,
					personHandle: true,
					personEmail: true,
				},
			},
		},
	});
}

export async function listSources({ userId, roomId, search }: ListArgs) {
	const id = await resolveRoomId(userId, roomId);
	if (!id) return [];

	return prisma.dealFlowSource.findMany({
		where: {
			roomId: id,
			...(search
				? {
						OR: [
							{ name: contains(search) },
							{ description: contains(search) },
							{ runByHandle: contains(search) },
						],
					}
				: {}),
		},
		orderBy: [{ sharedAt: "desc" }, { name: "asc" }],
		take: 500,
		select: {
			id: true,
			name: true,
			type: true,
			description: true,
			url: true,
			runByHandle: true,
			runByName: true,
			sharedAt: true,
			interests: {
				orderBy: { expressedAt: "desc" },
				take: 50,
				select: {
					id: true,
					personName: true,
					personHandle: true,
					personEmail: true,
				},
			},
		},
	});
}

/** How many records in each directory match a search, for the global bar. */
export async function searchCounts(input: {
	userId: string;
	roomId?: string;
	search: string;
}) {
	const id = await resolveRoomId(input.userId, input.roomId);
	const term = input.search.trim();
	if (!id || !term) {
		return { members: 0, startups: 0, deals: 0, sources: 0 };
	}

	const [members, startups, deals, sources] = await Promise.all([
		prisma.dealRoomMember.count({
			where: {
				roomId: id,
				OR: [
					{ name: contains(term) },
					{ handle: contains(term) },
					{ bio: contains(term) },
					{ email: contains(term) },
				],
			},
		}),
		prisma.dealStartup.count({
			where: {
				roomId: id,
				OR: [
					{ name: contains(term) },
					{ xHandle: contains(term) },
					{ description: contains(term) },
					{ sector: contains(term) },
				],
			},
		}),
		prisma.deal.count({
			where: {
				roomId: id,
				OR: [{ blurb: contains(term) }, { startup: { name: contains(term) } }],
			},
		}),
		prisma.dealFlowSource.count({
			where: {
				roomId: id,
				OR: [
					{ name: contains(term) },
					{ description: contains(term) },
					{ runByHandle: contains(term) },
				],
			},
		}),
	]);

	return { members, startups, deals, sources };
}
