import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";

/**
 * Encryption for the API credentials this app stores on your behalf.
 *
 * Deliberately free of the `server-only` marker so the tests can drive it
 * directly. Nothing here reads a credential by itself — `lib/credentials.ts`
 * is the boundary that does, and that one is server-only.
 *
 * These are live keys to somebody's X account and their model provider, so a
 * copy of the database should not be enough to use them. AES-256-GCM with a
 * key derived from CREDENTIALS_SECRET, which lives in .env and never in the
 * database — losing it makes the stored credentials unreadable, which is the
 * point.
 */

const PREFIX = "v1";

function key() {
	const secret =
		process.env.CREDENTIALS_SECRET ?? process.env.BETTER_AUTH_SECRET;

	if (!secret) {
		throw new Error(
			"CREDENTIALS_SECRET is not set. Run npm run setup, or add one to .env.",
		);
	}

	// A fixed salt keeps this deterministic across restarts. The secret is the
	// thing that has to be unguessable, and setup generates 32 random bytes.
	return scryptSync(secret, "dealroom-credentials", 32);
}

export function encryptSecret(value: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key(), iv);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);

	return [
		PREFIX,
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

export function decryptSecret(value: string): string | null {
	const [prefix, iv, tag, payload] = value.split(".");
	if (prefix !== PREFIX || !iv || !tag || !payload) return null;

	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			key(),
			Buffer.from(iv, "base64url"),
		);
		decipher.setAuthTag(Buffer.from(tag, "base64url"));

		return Buffer.concat([
			decipher.update(Buffer.from(payload, "base64url")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		// Wrong secret, or the row was tampered with. Either way it is not a
		// credential we can use, and pretending otherwise helps nobody.
		return null;
	}
}

/** What the UI is allowed to see: enough to recognise a key, not to use it. */
export function maskSecret(value: string | null | undefined): string | null {
	if (!value) return null;
	return value.length <= 8
		? "••••"
		: `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
