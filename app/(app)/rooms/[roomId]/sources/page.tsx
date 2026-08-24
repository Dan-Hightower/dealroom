"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type * as React from "react";
import { type Column, DataTable } from "@/components/data-table";
import { Directory, useRoom, useSearchTerm } from "@/components/room-shell";
import { HandleLink, PeopleList } from "@/components/ui";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/router";

type Source = inferRouterOutputs<AppRouter>["sources"][number];

const columns: Column<Source>[] = [
	{
		key: "name",
		header: "Source",
		value: (s) => s.name,
		cell: (s) => (
			<>
				{s.name}
				{s.url ? (
					<a
						className="block text-muted-foreground text-xs underline underline-offset-2 hover:no-underline"
						href={s.url}
						rel="noreferrer"
						target="_blank"
					>
						{s.url.replace(/^https?:\/\//, "")}
					</a>
				) : null}
			</>
		),
		className: "font-medium",
	},
	{
		key: "type",
		header: "Type",
		value: (s) => s.type,
		cell: (s) => (
			<span className="rounded-sm border border-border px-1.5 py-0.5 text-xs">
				{s.type}
			</span>
		),
	},
	{
		key: "runBy",
		header: "Run by",
		value: (s) => s.runByName ?? s.runByHandle,
		cell: (s) => <HandleLink handle={s.runByHandle} name={s.runByName} />,
	},
	{
		key: "description",
		header: "Description",
		value: (s) => s.description,
		className: "max-w-md text-muted-foreground",
	},
	{ key: "shared", header: "Shared", value: (s) => s.sharedAt },
	{
		key: "interested",
		header: "Interested",
		value: (s) =>
			s.interests
				.map((i) => i.personName ?? i.personHandle ?? "")
				.filter(Boolean)
				.join(", "),
		cell: (s) => <PeopleList people={s.interests} />,
	},
	{
		key: "interestCount",
		header: "Count",
		value: (s) => s.interests.length,
		align: "right",
	},
];

export default function SourcesPage(): React.JSX.Element {
	const { roomId } = useRoom();
	const search = useSearchTerm();
	const sources = trpc.sources.useQuery(
		{ roomId, search: search || undefined },
		{ enabled: Boolean(roomId) },
	);

	const rows = sources.data ?? [];

	return (
		<Directory count={rows.length} title="Deal flow sources">
			<DataTable
				columns={columns}
				empty="No deal flow sources extracted yet."
				filename="deal-flow-sources"
				rows={rows}
			/>
		</Directory>
	);
}
