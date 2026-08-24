import "server-only";

import { askGrokForJson, type GrokAccess, isGrokConfigured } from "@/lib/grok";

const MESSAGES_PER_BATCH = 120;

export type ExtractionMessage = {
	id: string;
	authorHandle?: string | null;
	authorName?: string | null;
	kind: string;
	sentAt?: Date | null;
	sentAtLabel?: string | null;
	text: string;
};

export type ExtractedMember = {
	handle: string | null;
	name: string | null;
	bio: string | null;
	email: string | null;
	messageRef: string | null;
};

export type ExtractedStartup = {
	name: string;
	xHandle: string | null;
	website: string | null;
	description: string | null;
	sector: string | null;
};

export type ExtractedDeal = {
	startupName: string;
	sharedByHandle: string | null;
	sharedByName: string | null;
	blurb: string | null;
	terms: string | null;
	roundStage: string | null;
	url: string | null;
	messageRef: string | null;
};

export type ExtractedSource = {
	name: string;
	type: string;
	description: string | null;
	url: string | null;
	runByHandle: string | null;
	runByName: string | null;
	messageRef: string | null;
};

export type ExtractedHolding = {
	personHandle: string | null;
	personName: string | null;
	startupName: string;
	note: string | null;
	messageRef: string | null;
};

export type ExtractedInterest = {
	targetType: "deal" | "source";
	targetName: string;
	personHandle: string | null;
	personName: string | null;
	personEmail: string | null;
	note: string | null;
	messageRef: string | null;
};

export type ExtractionResult = {
	members: ExtractedMember[];
	startups: ExtractedStartup[];
	deals: ExtractedDeal[];
	sources: ExtractedSource[];
	interests: ExtractedInterest[];
	holdings: ExtractedHolding[];
};

const nullableString = { type: ["string", "null"] };

function objectSchema(properties: Record<string, unknown>) {
	return {
		type: "object",
		additionalProperties: false,
		properties,
		required: Object.keys(properties),
	};
}

const EXTRACTION_SCHEMA = objectSchema({
	members: {
		type: "array",
		items: objectSchema({
			handle: nullableString,
			name: nullableString,
			bio: nullableString,
			email: nullableString,
			messageRef: nullableString,
		}),
	},
	startups: {
		type: "array",
		items: objectSchema({
			name: { type: "string" },
			xHandle: nullableString,
			website: nullableString,
			description: nullableString,
			sector: nullableString,
		}),
	},
	deals: {
		type: "array",
		items: objectSchema({
			startupName: { type: "string" },
			sharedByHandle: nullableString,
			sharedByName: nullableString,
			blurb: nullableString,
			terms: nullableString,
			roundStage: nullableString,
			url: nullableString,
			messageRef: nullableString,
		}),
	},
	sources: {
		type: "array",
		items: objectSchema({
			name: { type: "string" },
			type: {
				type: "string",
				enum: [
					"syndicate",
					"fund",
					"spv",
					"newsletter",
					"scout",
					"community",
					"other",
				],
			},
			description: nullableString,
			url: nullableString,
			runByHandle: nullableString,
			runByName: nullableString,
			messageRef: nullableString,
		}),
	},
	holdings: {
		type: "array",
		items: objectSchema({
			personHandle: nullableString,
			personName: nullableString,
			startupName: { type: "string" },
			note: nullableString,
			messageRef: nullableString,
		}),
	},
	interests: {
		type: "array",
		items: objectSchema({
			targetType: { type: "string", enum: ["deal", "source"] },
			targetName: { type: "string" },
			personHandle: nullableString,
			personName: nullableString,
			personEmail: nullableString,
			note: nullableString,
			messageRef: nullableString,
		}),
	},
});

const SYSTEM_PROMPT = `You read the transcript of a private group chat where investors share startup deals. It comes from X or from WhatsApp.

Extract only what the transcript actually states. Never invent a startup, a person, a website, or an email. Leave a field null when the chat does not say.

Return five collections:

1. members - people participating in the chat. Capture their display name, their handle, the self-introduction they posted (usually their first substantial message after joining, describing who they are and what they invest in), and an email address only if they typed one in a message. A handle is an @name on X. On WhatsApp people appear as a saved contact name or as a phone number in international form; put a phone number in the handle field exactly as written, and never invent one for somebody who appears under a name.
2. startups - every company discussed. Capture the name, the company's X handle if one is mentioned, website, a short description of what it does, and a sector if stated.
3. deals - each time somebody shares a startup as an investment opportunity. Record which startup, who shared it, the pitch or blurb they wrote, any terms (round size, valuation, cap, allocation), the round stage, and a link if one was posted.
4. sources - deal flow sources somebody offers, such as a syndicate they run, a fund, an SPV, a scout program, or a deal newsletter. Record the name, what type it is, how they described it, a link, and who runs it.
5. interests - anybody expressing interest in a deal or a deal flow source. This includes replies like "interested", "I'm in", "send me the deck", "add me to the syndicate", or asking for an allocation. Record who expressed it, what they were responding to, and their email or name if they supplied one in that message.

6. holdings - companies a person names as their OWN existing investments or portfolio, rather than something they are offering to the room now.

The difference between a deal and a holding matters more than anything else here.

A deal is an opportunity being put in front of the room right now. It usually reads as an ask: raising a round, an allocation is available, terms are quoted, a deck or intro is offered, people are invited to participate.

A holding is biography. When somebody introduces themselves and writes "portfolio companies include Northwind, Cobalt Systems, Meridian Robotics and more", or "I led their seed", or "we are investors in X", they are describing what they already own. Nobody is being invited to invest. Record every company in such a list as a holding for that person, and do NOT record any of them as a deal.

When a message does both - "we backed Acme at seed and they are raising again, I have allocation" - record a holding AND a deal.

A startup can legitimately appear as both, held by one member and shared as a deal by another. Still list the company once under startups.

Match interests and holdings to the exact startup name or source name used elsewhere in your answer. Set messageRef to the id of the message the fact came from.`;

function renderTranscript(messages: ExtractionMessage[]): string {
	return messages
		.map((message) => {
			const when = message.sentAt
				? message.sentAt.toISOString()
				: (message.sentAtLabel ?? "unknown time");
			const who = message.authorHandle
				? `@${message.authorHandle}`
				: (message.authorName ?? "unknown");
			const prefix = message.kind === "message" ? "" : `[${message.kind}] `;
			return `[${message.id}] ${when} ${who}: ${prefix}${message.text}`;
		})
		.join("\n");
}

function emptyResult(): ExtractionResult {
	return {
		members: [],
		startups: [],
		deals: [],
		sources: [],
		interests: [],
		holdings: [],
	};
}

function asArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

export function isExtractionConfigured(access?: GrokAccess | null): boolean {
	return isGrokConfigured(access);
}

export async function extractDealRoomFacts(input: {
	roomName: string;
	messages: ExtractionMessage[];
	access: GrokAccess;
}): Promise<ExtractionResult> {
	if (!input.messages.length) return emptyResult();

	const merged = emptyResult();
	let batches = 0;
	let failures = 0;
	let lastError = "";

	for (
		let offset = 0;
		offset < input.messages.length;
		offset += MESSAGES_PER_BATCH
	) {
		batches += 1;
		const batch = input.messages.slice(offset, offset + MESSAGES_PER_BATCH);
		const userPrompt = [
			`Group chat: ${input.roomName}`,
			"",
			"Transcript:",
			renderTranscript(batch),
		].join("\n");

		try {
			const parsed = (await askGrokForJson({
				access: input.access,
				schema: EXTRACTION_SCHEMA,
				schemaName: "deal_room_extraction",
				system: SYSTEM_PROMPT,
				user: userPrompt,
			})) as Partial<ExtractionResult>;

			merged.members.push(...asArray<ExtractedMember>(parsed.members));
			merged.startups.push(...asArray<ExtractedStartup>(parsed.startups));
			merged.deals.push(...asArray<ExtractedDeal>(parsed.deals));
			merged.sources.push(...asArray<ExtractedSource>(parsed.sources));
			merged.interests.push(...asArray<ExtractedInterest>(parsed.interests));
			merged.holdings.push(...asArray<ExtractedHolding>(parsed.holdings));
		} catch (error) {
			// One bad batch should not throw away the batches that did parse.
			failures += 1;
			lastError = error instanceof Error ? error.message : String(error);
			console.error(`Extraction batch at offset ${offset} failed:`, lastError);
		}
	}

	// Every batch failing is a broken key or a broken endpoint, not a chat with
	// nothing in it. Reporting that as a clean run with zero results is worse
	// than failing loudly.
	if (batches > 0 && failures === batches) {
		throw new Error(lastError || "Every extraction request failed");
	}

	return merged;
}
