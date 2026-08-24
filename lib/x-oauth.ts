import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * OAuth 2.0 with PKCE against X.
 *
 * PKCE is what lets this work without a client secret, which matters: the app
 * runs on each person's own machine, so there is nowhere to keep one.
 */

const AUTHORIZE = "https://x.com/i/oauth2/authorize";
const TOKEN = "https://api.x.com/2/oauth2/token";

/** Everything the Chat API needs, and nothing it does not. */
export const SCOPES = [
	"tweet.read",
	"users.read",
	"dm.read",
	"dm.write",
	"offline.access",
];

export function verifier() {
	return randomBytes(32).toString("base64url");
}

export function challengeFor(value: string) {
	return createHash("sha256").update(value).digest("base64url");
}

export function authorizeUrl(input: {
	clientId: string;
	redirectUri: string;
	state: string;
	challenge: string;
}) {
	const url = new URL(AUTHORIZE);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", input.clientId);
	url.searchParams.set("redirect_uri", input.redirectUri);
	url.searchParams.set("scope", SCOPES.join(" "));
	url.searchParams.set("state", input.state);
	url.searchParams.set("code_challenge", input.challenge);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
}

export async function exchangeCode(input: {
	clientId: string;
	code: string;
	redirectUri: string;
	verifier: string;
}) {
	const response = await fetch(TOKEN, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: input.clientId,
			code: input.code,
			redirect_uri: input.redirectUri,
			code_verifier: input.verifier,
		}),
	});

	if (!response.ok) {
		throw new Error(
			`X refused the authorization code (${response.status}). Check the client id and that the callback URL matches the one on your app.`,
		);
	}

	return (await response.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
	};
}

export async function refresh(input: {
	clientId: string;
	refreshToken: string;
}) {
	const response = await fetch(TOKEN, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			client_id: input.clientId,
			refresh_token: input.refreshToken,
		}),
	});

	if (!response.ok)
		throw new Error("Could not refresh the X token. Reconnect in Settings.");

	return (await response.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
	};
}

export function redirectUri() {
	const base = process.env.APP_URL ?? "http://localhost:3000";
	return `${base.replace(/\/$/, "")}/api/x/oauth/callback`;
}
