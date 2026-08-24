import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

/**
 * Per-user API credentials.
 *
 * Everything here is somebody's own: their X app, their XChat PIN, their model
 * provider key. Nothing is shared and nothing is borrowed — an instance holds
 * only the credentials of the people using it.
 */

const SECRET_FIELDS = [
	"xAccessToken",
	"xRefreshToken",
	"xChatPin",
	"xaiApiKey",
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

export type Credentials = {
	xClientId: string | null;
	xAccessToken: string | null;
	xRefreshToken: string | null;
	xTokenExpiresAt: Date | null;
	xUserId: string | null;
	xUsername: string | null;
	xChatPin: string | null;
	xChatJuiceboxConfig: string | null;
	xaiApiKey: string | null;
};

export async function getCredentials(userId: string): Promise<Credentials> {
	const row = await prisma.userCredentials.findUnique({ where: { userId } });

	const empty: Credentials = {
		xClientId: null,
		xAccessToken: null,
		xRefreshToken: null,
		xTokenExpiresAt: null,
		xUserId: null,
		xUsername: null,
		xChatPin: null,
		xChatJuiceboxConfig: null,
		xaiApiKey: null,
	};

	if (!row) return empty;

	const out = { ...empty, ...row } as Credentials & Record<string, unknown>;

	for (const field of SECRET_FIELDS) {
		const stored = row[field];
		out[field] = stored ? decryptSecret(stored) : null;
	}

	return out as Credentials;
}

export async function saveCredentials(
	userId: string,
	patch: Partial<Credentials>,
) {
	const data: Record<string, unknown> = {};

	for (const [field, value] of Object.entries(patch)) {
		if (value === undefined) continue;

		data[field] = SECRET_FIELDS.includes(field as SecretField)
			? typeof value === "string" && value
				? encryptSecret(value)
				: null
			: value;
	}

	await prisma.userCredentials.upsert({
		where: { userId },
		create: { userId, ...data },
		update: data,
	});
}

/** True when this user has enough to read a chat from X. */
export function canReadX(credentials: Credentials) {
	return Boolean(credentials.xAccessToken);
}
