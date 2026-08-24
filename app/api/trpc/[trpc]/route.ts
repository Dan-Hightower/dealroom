import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { createContext } from "@/trpc/init";
import { appRouter } from "@/trpc/router";

function handler(request: NextRequest) {
	return fetchRequestHandler({
		endpoint: "/api/trpc",
		req: request,
		router: appRouter,
		createContext,
	});
}

export { handler as GET, handler as POST };
