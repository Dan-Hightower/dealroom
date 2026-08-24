"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type * as React from "react";
import { type Column, DataTable } from "@/components/data-table";
import { Directory, useRoom, useSearchTerm } from "@/components/room-shell";
import { HandleLink } from "@/components/ui";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/router";

type Startup = inferRouterOutputs<AppRouter>["startups"][number];

function kind(s: Startup) {
	if (s._count.deals && s._count.holdings) return "Deal · Portfolio";
	if (s._count.deals) return "Deal";
	if (s._count.holdings) return "Portfolio";
	return "Mentioned";
}

const columns: Column<Startup>[] = [
	{
		key: "name",
		header: "Startup",
		value: (s) => s.name,
		cell: (s) => (
			<>
				{s.name}
				{s.xHandle ? (
					<span className="block text-muted-foreground text-xs">
						<HandleLink handle={s.xHandle} />
					</span>
				) : null}
			</>
		),
		className: "font-medium",
	},
	{ key: "kind", header: "Type", value: kind },
	{
		key: "website",
		header: "Website",
		value: (s) => s.website,
		cell: (s) =>
			s.website ? (
				<a
					className="underline underline-offset-2 hover:no-underline"
					href={s.website}
					rel="noreferrer"
					target="_blank"
				>
					{s.website.replace(/^https?:\/\//, "")}
				</a>
			) : (
				<span className="text-muted-foreground">—</span>
			),
		className: "max-w-[180px] truncate",
	},
	{ key: "sector", header: "Sector", value: (s) => s.sector },
	{
		key: "description",
		header: "What it does",
		value: (s) => s.description,
		className: "max-w-md text-muted-foreground",
	},
	{
		key: "sharedBy",
		header: "Shared by",
		value: (s) =>
			s.deals.map((d) => d.sharedByName ?? d.sharedByHandle ?? "").join(", "),
		cell: (s) =>
			s.deals.length ? (
				<ul className="space-y-1">
					{s.deals.map((deal) => (
						<li key={deal.id}>
							<HandleLink
								handle={deal.sharedByHandle}
								name={deal.sharedByName}
							/>
						</li>
					))}
				</ul>
			) : (
				<span className="text-muted-foreground">—</span>
			),
	},
	{
		key: "heldBy",
		header: "Held by",
		value: (s) =>
			s.holdings.map((h) => h.member.name ?? h.member.handle ?? "").join(", "),
		cell: (s) =>
			s.holdings.length ? (
				<ul className="space-y-1">
					{s.holdings.map((holding) => (
						<li key={holding.id}>
							<HandleLink
								handle={holding.member.handle}
								name={holding.member.name}
							/>
						</li>
					))}
				</ul>
			) : (
				<span className="text-muted-foreground">—</span>
			),
	},
	{
		key: "lastMentioned",
		header: "Last mentioned",
		value: (s) => s.lastMentionedAt,
	},
	{
		key: "interest",
		header: "Interest",
		value: (s) => s._count.interests,
		align: "right",
	},
];

export default function StartupsPage(): React.JSX.Element {
	const { roomId } = useRoom();
	const search = useSearchTerm();
	const startups = trpc.startups.useQuery(
		{ roomId, search: search || undefined },
		{ enabled: Boolean(roomId) },
	);

	const rows = startups.data ?? [];

	return (
		<Directory count={rows.length} title="Startups">
			<DataTable
				columns={columns}
				empty="No startups extracted yet."
				filename="startups"
				rows={rows}
			/>
		</Directory>
	);
}
