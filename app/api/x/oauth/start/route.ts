import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCredentials } from "@/lib/credentials";
import {
	authorizeUrl,
	challengeFor,
	redirectUri,
	verifier,
} from "@/lib/x-oauth";

export async function GET(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) return NextResponse.redirect(new URL("/sign-in", request.url));

	const credentials = await getCredentials(session.user.id);
	const clientId = credentials.xClientId;

	if (!clientId) {
		return NextResponse.redirect(
			new URL("/settings?error=no-client-id", request.url),
		);
	}

	const state = randomBytes(16).toString("base64url");
	const code = verifier();

	const response = NextResponse.redirect(
		authorizeUrl({
			clientId,
			redirectUri: redirectUri(),
			state,
			challenge: challengeFor(code),
		}),
	);

	// The verifier never goes to X, only its hash does; it comes back out of
	// this cookie to prove the callback belongs to this browser.
	for (const [name, value] of [
		["x_oauth_state", state],
		["x_oauth_verifier", code],
	]) {
		response.cookies.set(name as string, value as string, {
			httpOnly: true,
			sameSite: "lax",
			secure: request.nextUrl.protocol === "https:",
			maxAge: 600,
			path: "/",
		});
	}

	return response;
}
