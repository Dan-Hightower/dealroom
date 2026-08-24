"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ImportExport } from "@/components/import-export";
import { Button, Empty, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/utils";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/router";

type Room = inferRouterOutputs<AppRouter>["rooms"][number];

function AddChat({ compact }: { compact?: boolean }) {
	const utils = trpc.useUtils();
	const router = useRouter();
	const credentials = trpc.credentials.useQuery();
	const conversations = trpc.xConversations.useQuery(undefined, {
		enabled: Boolean(credentials.data?.hasXAccess),
		retry: false,
	});
	const createRoom = trpc.createRoom.useMutation();
	const [open, setOpen] = React.useState(!compact);
	const [error, setError] = React.useState<string | null>(null);

	async function track(conversationId: string, name: string) {
		setError(null);

		try {
			const room = await createRoom.mutateAsync({ conversationId, name });
			await utils.invalidate();
			router.push(`/rooms/${room.id}`);
		} catch (nextError) {
			setError(
				nextError instanceof Error ? nextError.message : "Could not save that.",
			);
		}
	}

	if (compact && !open) {
		return (
			<Button onClick={() => setOpen(true)} size="sm">
				Add a chat
			</Button>
		);
	}

	// WhatsApp needs no X account, so the import stays reachable either way.
	const whatsApp = (
		<div className="border-border border-t pt-4">
			<p className="mb-2 text-muted-foreground text-sm">
				WhatsApp has no API that will hand over a group you are in, so its
				history comes from an exported file. In WhatsApp, open the group, choose{" "}
				<strong className="font-medium text-foreground">Export chat</strong>{" "}
				without media, and load the .txt here.
			</p>
			<ImportExport label="Import WhatsApp export" />
		</div>
	);

	if (!credentials.data?.hasXAccess) {
		return (
			<div className="max-w-md space-y-4">
				<div>
					<h2 className="font-semibold text-lg tracking-tight">
						Connect X to get started
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Deal Room reads your group chats through the X Chat API. Connect
						your account in Settings and your chats show up here to pick from.
					</p>
				</div>
				<Link
					className="inline-flex h-8 items-center rounded-sm border border-foreground bg-foreground px-3 font-medium text-background text-xs"
					href="/settings"
				>
					Open Settings
				</Link>
				{whatsApp}
			</div>
		);
	}

	return (
		<div className="max-w-md space-y-4">
			{!compact ? (
				<div>
					<h2 className="font-semibold text-lg tracking-tight">
						Track a group chat
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						These are the chats your X account can see. Pick one and Deal Room
						pulls its history in.
					</p>
				</div>
			) : null}

			{conversations.isPending ? (
				<p className="text-muted-foreground text-sm">Asking X…</p>
			) : conversations.error ? (
				<p className="text-sm">{conversations.error.message}</p>
			) : conversations.data?.length ? (
				<ul className="divide-y divide-border border-border border-y">
					{conversations.data.map((conversation) => (
						<li
							className="flex items-center justify-between gap-3 py-2"
							key={conversation.id}
						>
							<span className="min-w-0 truncate text-sm">
								{conversation.name}
								{conversation.isGroup ? (
									<span className="ml-2 text-muted-foreground text-xs">
										group
									</span>
								) : null}
							</span>
							<Button
								disabled={createRoom.isPending}
								onClick={() => track(conversation.id, conversation.name)}
								size="sm"
								variant="outline"
							>
								Track
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground text-sm">
					X returned no conversations for this account.
				</p>
			)}

			{error ? <p className="text-sm">{error}</p> : null}

			{compact ? (
				<Button onClick={() => setOpen(false)} size="sm" variant="ghost">
					Done
				</Button>
			) : null}

			{whatsApp}
		</div>
	);
}

function ChatRow({ room }: { room: Room }) {
	const utils = trpc.useUtils();
	const updateRoom = trpc.updateRoom.useMutation();
	const deleteRoom = trpc.deleteRoom.useMutation();
	const [renaming, setRenaming] = React.useState(false);
	const [name, setName] = React.useState(room.name);

	const stats = [
		["members", room._count.members],
		["startups", room._count.startups],
		["deals", room._count.deals],
		["sources", room._count.sources],
		["interest", room._count.interests],
	] as const;

	async function rename(event: React.FormEvent) {
		event.preventDefault();
		await updateRoom.mutateAsync({ roomId: room.id, name });
		await utils.invalidate();
		setRenaming(false);
	}

	async function remove() {
		if (
			!window.confirm(
				`Delete “${room.name}” and everything captured from it? This cannot be undone.`,
			)
		) {
			return;
		}
		await deleteRoom.mutateAsync({ roomId: room.id });
		await utils.invalidate();
	}

	return (
		<div className="flex flex-wrap items-start justify-between gap-4 border-border border-b py-4">
			<div className="min-w-0 space-y-1">
				{renaming ? (
					<form className="flex items-center gap-2" onSubmit={rename}>
						<Input
							autoFocus
							className="h-8 w-64"
							onChange={(event) => setName(event.target.value)}
							value={name}
						/>
						<Button size="sm" type="submit">
							Save
						</Button>
						<Button
							onClick={() => {
								setName(room.name);
								setRenaming(false);
							}}
							size="sm"
							type="button"
							variant="ghost"
						>
							Cancel
						</Button>
					</form>
				) : (
					<Link
						className="font-medium underline-offset-2 hover:underline"
						href={`/rooms/${room.id}`}
					>
						{room.name}
					</Link>
				)}

				<p className="text-muted-foreground text-xs tabular-nums">
					{room.messageCount} messages ·{" "}
					{room.lastSyncedAt
						? `synced ${formatDateTime(room.lastSyncedAt)}`
						: "never synced"}
				</p>

				<p className="text-muted-foreground text-xs tabular-nums">
					{stats.map(([label, n], index) => (
						<React.Fragment key={label}>
							{index ? " · " : ""}
							<span className="text-foreground">{n}</span> {label}
						</React.Fragment>
					))}
				</p>

				{room.lastSyncError ? (
					<p className="max-w-xl text-xs">{room.lastSyncError}</p>
				) : null}
			</div>

			<div className="flex shrink-0 items-center gap-1">
				<Button onClick={() => setRenaming(true)} size="sm" variant="ghost">
					Rename
				</Button>
				<Button
					disabled={deleteRoom.isPending}
					onClick={remove}
					size="sm"
					variant="ghost"
				>
					Delete
				</Button>
				<Link
					className="inline-flex h-8 items-center rounded-sm border border-foreground bg-foreground px-3 font-medium text-background text-xs"
					href={`/rooms/${room.id}`}
				>
					Open
				</Link>
			</div>
		</div>
	);
}

export function Home() {
	const router = useRouter();
	const rooms = trpc.rooms.useQuery();
	const [filter, setFilter] = React.useState("");

	if (rooms.isPending) {
		return <p className="p-8 text-muted-foreground text-sm">Loading…</p>;
	}

	const all = rooms.data ?? [];
	const shown = filter
		? all.filter((room) =>
				room.name.toLowerCase().includes(filter.toLowerCase()),
			)
		: all;

	return (
		<div className="mx-auto max-w-4xl px-6 py-10">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-semibold text-xl tracking-tight">Deal Room</h1>
					<p className="text-muted-foreground text-sm">
						{all.length} {all.length === 1 ? "chat" : "chats"}
					</p>
				</div>
				<div className="flex items-center gap-1">
					<Link
						className="inline-flex h-8 items-center rounded-sm px-3 font-medium text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
						href="/settings"
					>
						Settings
					</Link>
					<Button
						onClick={() =>
							authClient.signOut().then(() => router.push("/sign-in"))
						}
						size="sm"
						variant="ghost"
					>
						Sign out
					</Button>
				</div>
			</header>

			{all.length ? (
				<>
					<div className="flex flex-wrap items-center justify-between gap-3 py-6">
						<Input
							className="max-w-xs"
							onChange={(event) => setFilter(event.target.value)}
							placeholder="Filter chats…"
							value={filter}
						/>
						<AddChat compact />
					</div>

					{shown.length ? (
						<div className="border-border border-t">
							{shown.map((room) => (
								<ChatRow key={room.id} room={room} />
							))}
						</div>
					) : (
						<Empty>No chat matches “{filter}”.</Empty>
					)}
				</>
			) : (
				<div className="py-10">
					<AddChat />
				</div>
			)}
		</div>
	);
}
