import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCredentials, saveCredentials } from "@/lib/credentials";
import { exchangeCode, redirectUri } from "@/lib/x-oauth";

export async function GET(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) return NextResponse.redirect(new URL("/sign-in", request.url));

	const settings = new URL("/settings", request.url);
	const code = request.nextUrl.searchParams.get("code");
	const state = request.nextUrl.searchParams.get("state");
	const expected = request.cookies.get("x_oauth_state")?.value;
	const verifier = request.cookies.get("x_oauth_verifier")?.value;

	if (!code || !state || !verifier || state !== expected) {
		settings.searchParams.set("error", "oauth-state");
		return NextResponse.redirect(settings);
	}

	const credentials = await getCredentials(session.user.id);
	const clientId = credentials.xClientId;

	if (!clientId) {
		settings.searchParams.set("error", "no-client-id");
		return NextResponse.redirect(settings);
	}

	try {
		const tokens = await exchangeCode({
			clientId,
			code,
			redirectUri: redirectUri(),
			verifier,
		});

		// Who this token belongs to, so messages can be attributed and the
		// right identity handed to the decryption library.
		const me = await fetch("https://api.x.com/2/users/me", {
			headers: { authorization: `Bearer ${tokens.access_token}` },
		});
		const body = (await me.json().catch(() => ({}))) as {
			data?: { id?: string; username?: string };
		};

		await saveCredentials(session.user.id, {
			xAccessToken: tokens.access_token,
			xRefreshToken: tokens.refresh_token ?? null,
			xTokenExpiresAt: tokens.expires_in
				? new Date(Date.now() + tokens.expires_in * 1000)
				: null,
			xUserId: body.data?.id ?? null,
			xUsername: body.data?.username ?? null,
		});

		settings.searchParams.set("connected", "x");
	} catch (error) {
		settings.searchParams.set(
			"error",
			error instanceof Error ? error.message.slice(0, 200) : "oauth-failed",
		);
	}

	const response = NextResponse.redirect(settings);
	response.cookies.delete("x_oauth_state");
	response.cookies.delete("x_oauth_verifier");
	return response;
}
