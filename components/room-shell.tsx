"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ImportExport } from "@/components/import-export";
import { Button, Input } from "@/components/ui";
import { cn, formatDateTime } from "@/lib/utils";
import { trpc } from "@/trpc/client";

const TABS = [
	{ label: "Overview", path: "" },
	{ label: "Members", path: "/members" },
	{ label: "Startups", path: "/startups" },
	{ label: "Deals", path: "/deals" },
	{ label: "Sources", path: "/sources" },
];

/** The chat being viewed, taken from the route rather than a query param. */
export function useRoom() {
	const pathname = usePathname();
	const roomId = pathname.split("/")[2];
	const rooms = trpc.rooms.useQuery();

	return {
		roomId,
		room: rooms.data?.find((room) => room.id === roomId),
		isLoading: rooms.isPending,
	};
}

/** The search term, held in the URL so it survives navigation. */
export function useSearchTerm() {
	return useSearchParams().get("q") ?? "";
}

export function SearchBox({
	placeholder = "Search…",
	withCounts,
}: {
	placeholder?: string;
	withCounts?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const term = useSearchTerm();
	const [draft, setDraft] = React.useState(term);

	React.useEffect(() => setDraft(term), [term]);

	// Keep typing responsive while the URL, and every query keyed off it,
	// catch up a beat later.
	React.useEffect(() => {
		if (draft === term) return;

		const timer = window.setTimeout(() => {
			const params = new URLSearchParams(searchParams.toString());
			if (draft) {
				params.set("q", draft);
			} else {
				params.delete("q");
			}
			router.replace(`${pathname}?${params.toString()}`);
		}, 250);

		return () => window.clearTimeout(timer);
	}, [draft, term, pathname, router, searchParams]);

	const counts = trpc.searchCounts.useQuery(
		{ roomId: withCounts, search: term || undefined },
		{ enabled: Boolean(withCounts && term) },
	);

	const hits = counts.data
		? [
				{ label: "Members", path: "/members", n: counts.data.members },
				{ label: "Startups", path: "/startups", n: counts.data.startups },
				{ label: "Deals", path: "/deals", n: counts.data.deals },
				{ label: "Sources", path: "/sources", n: counts.data.sources },
			]
		: [];

	return (
		<div className="w-full max-w-md">
			<Input
				aria-label="Search"
				onChange={(event) => setDraft(event.target.value)}
				placeholder={placeholder}
				value={draft}
			/>
			{withCounts && term && counts.data ? (
				<div className="mt-2 flex flex-wrap gap-3 text-xs">
					{hits.map((hit) => (
						<Link
							className={cn(
								"tabular-nums",
								hit.n
									? "underline underline-offset-2 hover:no-underline"
									: "pointer-events-none text-muted-foreground",
							)}
							href={`/rooms/${withCounts}${hit.path}?q=${encodeURIComponent(term)}`}
							key={hit.path}
						>
							{hit.label} {hit.n}
						</Link>
					))}
				</div>
			) : null}
		</div>
	);
}

export function RoomShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const { room, roomId, isLoading } = useRoom();
	const utils = trpc.useUtils();
	const [status, setStatus] = React.useState<string | null>(null);

	/// Refresh means "ask X for this conversation". The work happens on the
	/// server, against the X Chat API.
	const sync = trpc.syncRoom.useMutation();

	async function refresh() {
		if (!room) return;

		setStatus("Reading this chat from X…");

		try {
			const result = await sync.mutateAsync({ roomId: room.id });
			const extraction = result.extraction.ran
				? ` · ${result.extraction.startups} startups, ${result.extraction.deals} deals`
				: result.extraction.reason
					? ` · ${result.extraction.reason}`
					: "";
			const repaired = result.repairedDates
				? ` · ${result.repairedDates} dates corrected`
				: "";
			const undecrypted = result.undecrypted
				? ` · ${result.undecrypted} events could not be decrypted`
				: "";

			setStatus(
				`Synced ${result.newMessages} new of ${result.totalMessages}${repaired}${extraction}${undecrypted}`,
			);
			await utils.invalidate();
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Sync failed.");
		}
	}

	if (isLoading) {
		return <p className="p-8 text-muted-foreground text-sm">Loading…</p>;
	}

	if (!room) {
		return (
			<div className="mx-auto max-w-6xl px-6 py-12">
				<p className="text-sm">
					That chat is not here.{" "}
					<Link className="underline underline-offset-2" href="/">
						Back to all chats
					</Link>
					.
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl px-6 py-8">
			<Link
				className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
				href="/"
			>
				← All chats
			</Link>

			<header className="mt-3 flex flex-wrap items-center justify-between gap-3 border-border border-b pb-4">
				<div>
					<h1 className="font-semibold text-base">{room.name}</h1>
					<p className="text-muted-foreground text-xs tabular-nums">
						{room.messageCount} messages ·{" "}
						{room.lastSyncedAt
							? `synced ${formatDateTime(room.lastSyncedAt)}`
							: "never synced"}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<ImportExport roomId={room.id} />
					{room.chatUrl ? (
						<a
							className="inline-flex h-8 items-center rounded-sm border border-border px-3 font-medium text-xs hover:bg-accent"
							href={room.chatUrl}
							rel="noreferrer"
							target="_blank"
						>
							Open chat
						</a>
					) : null}
					{/* WhatsApp has no API that hands over a group you are in, so a
					    WhatsApp chat is only ever refreshed by importing a newer
					    export. */}
					{room.platform === "x" ? (
						<Button disabled={sync.isPending} onClick={refresh} size="sm">
							{sync.isPending ? "Reading…" : "Refresh"}
						</Button>
					) : null}
				</div>
			</header>

			<div className="py-4">
				<SearchBox
					placeholder="Search members, startups, deals, sources…"
					withCounts={roomId}
				/>
			</div>

			<nav className="flex flex-wrap gap-1 pb-4">
				{TABS.map((tab) => {
					const href = `/rooms/${roomId}${tab.path}`;
					return (
						<Link
							className={cn(
								"rounded-sm border px-3 py-1.5 font-medium text-sm transition-colors",
								pathname === href
									? "border-foreground bg-foreground text-background"
									: "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
							href={href}
							key={tab.path}
						>
							{tab.label}
						</Link>
					);
				})}
			</nav>

			{(status ?? room.lastSyncError) ? (
				<p className="pb-4 text-sm">{status ?? room.lastSyncError}</p>
			) : null}

			{children}
		</div>
	);
}

export function Directory({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}) {
	const term = useSearchTerm();

	return (
		<section className="space-y-4">
			<div>
				<h2 className="font-semibold text-lg tracking-tight">{title}</h2>
				<p className="text-muted-foreground text-xs tabular-nums">
					{count} {count === 1 ? "record" : "records"}
					{term ? ` matching “${term}”` : ""}
				</p>
			</div>
			{children}
		</section>
	);
}
