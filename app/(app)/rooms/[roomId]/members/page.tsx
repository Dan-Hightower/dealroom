"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type * as React from "react";
import { type Column, DataTable } from "@/components/data-table";
import { Directory, useRoom, useSearchTerm } from "@/components/room-shell";
import { HandleLink } from "@/components/ui";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/router";

type Member = inferRouterOutputs<AppRouter>["members"][number];

const columns: Column<Member>[] = [
	{
		key: "member",
		header: "Member",
		value: (m) => m.name ?? m.handle ?? "",
		cell: (m) => <HandleLink handle={m.handle} name={m.name} />,
		className: "font-medium",
	},
	{
		key: "joined",
		header: "Joined",
		value: (m) => m.joinedAt ?? m.firstSeenAt,
	},
	{
		key: "intro",
		header: "Intro",
		value: (m) => m.bio,
		className: "max-w-md text-muted-foreground",
	},
	{ key: "email", header: "Email", value: (m) => m.email },
	{
		key: "portfolio",
		header: "Portfolio",
		value: (m) => m.holdings.map((h) => h.startup.name).join(", "),
		className: "max-w-xs text-sm",
	},
	{
		key: "messages",
		header: "Messages",
		value: (m) => m.messageCount,
		align: "right",
	},
	{
		key: "shared",
		header: "Shared",
		value: (m) => m._count.sharedDeals,
		align: "right",
	},
	{
		key: "interests",
		header: "Interests",
		value: (m) => m._count.interests,
		align: "right",
	},
];

export default function MembersPage(): React.JSX.Element {
	const { roomId } = useRoom();
	const search = useSearchTerm();
	const members = trpc.members.useQuery(
		{ roomId, search: search || undefined },
		{ enabled: Boolean(roomId) },
	);

	const rows = members.data ?? [];

	return (
		<Directory count={rows.length} title="Members">
			<DataTable
				columns={columns}
				empty="No members yet. Hit Refresh to pull the chat in."
				filename="members"
				rows={rows}
			/>
		</Directory>
	);
}
