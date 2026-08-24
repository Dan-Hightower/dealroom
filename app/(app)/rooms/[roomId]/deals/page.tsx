"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type * as React from "react";
import { type Column, DataTable } from "@/components/data-table";
import { Directory, useRoom, useSearchTerm } from "@/components/room-shell";
import { HandleLink, PeopleList } from "@/components/ui";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/router";

type Deal = inferRouterOutputs<AppRouter>["deals"][number];

const people = (deal: Deal) =>
	deal.interests
		.map((i) => i.personName ?? i.personHandle ?? "")
		.filter(Boolean)
		.join(", ");

const columns: Column<Deal>[] = [
	{
		key: "startup",
		header: "Startup",
		value: (d) => d.startup.name,
		cell: (d) => (
			<>
				{d.startup.name}
				{d.startup.xHandle ? (
					<span className="block text-muted-foreground text-xs">
						<HandleLink handle={d.startup.xHandle} />
					</span>
				) : null}
			</>
		),
		className: "font-medium",
	},
	{
		key: "sharedBy",
		header: "Shared by",
		value: (d) => d.sharedByName ?? d.sharedByHandle,
		cell: (d) => <HandleLink handle={d.sharedByHandle} name={d.sharedByName} />,
	},
	{ key: "when", header: "When", value: (d) => d.sharedAt },
	{
		key: "blurb",
		header: "Pitch",
		value: (d) => d.blurb,
		className: "max-w-md text-muted-foreground",
	},
	{
		key: "terms",
		header: "Terms",
		value: (d) => [d.roundStage, d.terms].filter(Boolean).join(" · "),
	},
	{
		key: "interested",
		header: "Interested",
		value: people,
		cell: (d) => <PeopleList people={d.interests} />,
	},
	{
		key: "interestCount",
		header: "Count",
		value: (d) => d.interests.length,
		align: "right",
	},
];

export default function DealsPage(): React.JSX.Element {
	const { roomId } = useRoom();
	const search = useSearchTerm();
	const deals = trpc.deals.useQuery(
		{ roomId, search: search || undefined },
		{ enabled: Boolean(roomId) },
	);

	const rows = deals.data ?? [];

	return (
		<Directory count={rows.length} title="Deals shared">
			<DataTable
				columns={columns}
				empty="No deals extracted yet."
				filename="deals"
				rows={rows}
			/>
		</Directory>
	);
}
