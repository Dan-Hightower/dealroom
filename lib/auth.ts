import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
	appName: "Deal Room",
	baseURL: process.env.APP_URL ?? "http://localhost:3000",
	secret: process.env.BETTER_AUTH_SECRET,
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	emailAndPassword: {
		enabled: true,
		// No mail provider is wired up, so verifying an address is impossible.
		// This app is something you run for yourself; a password is enough.
		requireEmailVerification: false,
		autoSignIn: true,
		minPasswordLength: 8,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
	},
	plugins: [nextCookies()],
});
