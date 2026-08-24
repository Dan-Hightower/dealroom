"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import * as React from "react";
import superjson from "superjson";
import type { AppRouter } from "@/trpc/router";

export const trpc = createTRPCReact<AppRouter>();

export function TrpcProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = React.useState(
		() =>
			new QueryClient({
				defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
			}),
	);

	const [trpcClient] = React.useState(() =>
		trpc.createClient({
			links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
		}),
	);

	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
