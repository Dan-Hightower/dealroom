import { z } from "zod";

export const platformSchema = z.enum(["x", "whatsapp"]);

/**
 * An @handle on X, or a phone number on WhatsApp. Both arrive in this one
 * field; the reader for each platform decides what it puts there, and the
 * leading + on a phone number is what keeps them apart.
 */
const handleSchema = z
	.string()
	.trim()
	.max(32)
	.transform((value) => value.replace(/^@/, ""))
	.refine(
		(value) =>
			/^[A-Za-z0-9_]{1,15}$/.test(value) || /^\+?\d{7,15}$/.test(value),
		"Not a handle or a phone number",
	)
	.transform((value) =>
		/^\+?\d{7,15}$/.test(value)
			? `+${value.replace(/\D/g, "")}`
			: value.toLowerCase(),
	);

const trimmed = (max: number) =>
	z
		.string()
		.trim()
		.transform((value) => value.slice(0, max));

const optionalText = (max: number) =>
	trimmed(max)
		.optional()
		.or(z.literal("").transform(() => undefined));

const CHAT_HOSTS = ["x.com/", "twitter.com/", "web.whatsapp.com"];

export const chatUrlSchema = z
	.string()
	.trim()
	.url("Paste the full URL from your browser")
	.max(512)
	.refine(
		(value) => CHAT_HOSTS.some((host) => value.includes(host)),
		"That does not look like an X or WhatsApp conversation URL",
	);

/// A URL tells us where a chat lives without anyone having to say so.
export function platformFromUrl(value: string) {
	return value.includes("whatsapp.com") ? "whatsapp" : "x";
}

export const dealRoomSyncSchema = z.object({
	chatUrl: chatUrlSchema,
	platform: platformSchema.default("x"),
	conversationId: optionalText(128),
	title: optionalText(200),
	selfHandle: handleSchema.optional(),
	reachedStart: z.boolean().default(false),
	participants: z
		.array(
			z.object({
				handle: handleSchema.optional(),
				name: optionalText(120),
				profileUrl: optionalText(512),
			}),
		)
		.max(500)
		.default([]),
	messages: z
		.array(
			z.object({
				authorHandle: handleSchema.optional(),
				authorName: optionalText(120),
				kind: z.enum(["message", "join", "leave", "system"]).default("message"),
				sentAtIso: optionalText(64),
				sentAtLabel: optionalText(64),
				sequence: z.number().int().min(0).max(100_000),
				text: trimmed(8000).pipe(z.string().min(1)),
				externalId: optionalText(64),
				outgoing: z.boolean().optional(),
			}),
		)
		.max(5000),
});

export const createRoomSchema = z.object({
	name: trimmed(200).pipe(z.string().min(1, "Give the room a name")),
	/// An X conversation is addressed by its id, not by a URL. A URL is still
	/// accepted so a link pasted from the browser works.
	conversationId: optionalText(64),
	chatUrl: chatUrlSchema.optional(),
});

export const syncRoomSchema = z.object({
	roomId: z.string().min(1),
	maxEvents: z.number().int().min(1).max(50_000).optional(),
});

export const credentialsSchema = z.object({
	xClientId: optionalText(200),
	xAccessToken: optionalText(4000),
	xRefreshToken: optionalText(4000),
	xUserId: optionalText(64),
	xUsername: optionalText(64),
	xChatPin: optionalText(64),
	xaiApiKey: optionalText(200),
});

export const updateRoomSchema = z.object({
	roomId: z.string().min(1),
	name: optionalText(200),
	description: optionalText(2000),
	chatUrl: chatUrlSchema.optional(),
});

export const deleteRoomSchema = z.object({ roomId: z.string().min(1) });

export const listSchema = z.object({
	roomId: z.string().min(1).optional(),
	search: optionalText(120),
});

export const optionalRoomSchema = z
	.object({ roomId: z.string().min(1).optional() })
	.optional();

export const reextractSchema = z.object({
	roomId: z.string().min(1),
	full: z.boolean().default(false),
});

export type DealRoomSyncInput = z.infer<typeof dealRoomSyncSchema>;
