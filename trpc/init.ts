import { initTRPC, TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import superjson from "superjson";
import { auth } from "@/lib/auth";

export async function createContext() {
	const session = await auth.api.getSession({ headers: await headers() });
	return { user: session?.user ?? null };
}

const t = initTRPC.context<typeof createContext>().create({
	transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/** Everything in this app belongs to one signed-in person. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.user) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in first." });
	}
	return next({ ctx: { user: ctx.user } });
});
