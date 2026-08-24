"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui";
import { trpc } from "@/trpc/client";

type Result = {
	roomId: string;
	newMessages: number;
	totalMessages: number;
	repairedDates: number;
	skippedLines: number;
	extraction: {
		ran: boolean;
		reason?: string;
		deals: number;
		startups: number;
	};
};

/**
 * Loads a chat exported from WhatsApp.
 *
 * WhatsApp will not hand a group's history to anything but its own export, so
 * this is how a chat older than a few months gets in at all. Given a roomId it
 * adds to that chat; without one it creates a new chat from the file.
 */
export function ImportExport({
	roomId,
	label = "Import export",
}: {
	roomId?: string;
	label?: string;
}) {
	const router = useRouter();
	const utils = trpc.useUtils();
	const input = React.useRef<HTMLInputElement>(null);
	const [busy, setBusy] = React.useState(false);
	const [status, setStatus] = React.useState<string | null>(null);

	async function upload(file: File) {
		setBusy(true);
		setStatus("Reading the file…");

		const body = new FormData();
		body.set("file", file);
		if (roomId) body.set("roomId", roomId);
		// An export states a wall clock and no zone. This browser's zone is the
		// best guess at the phone the export came from.
		body.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);

		try {
			const response = await fetch("/api/import", { method: "POST", body });
			const result = (await response.json()) as Result & { error?: string };

			if (!response.ok) {
				setStatus(result.error ?? "Import failed.");
				return;
			}

			const extraction = result.extraction.ran
				? ` · ${result.extraction.startups} startups, ${result.extraction.deals} deals`
				: result.extraction.reason
					? ` · ${result.extraction.reason}`
					: "";

			setStatus(
				`Imported ${result.newMessages} new of ${result.totalMessages}${extraction}`,
			);

			await utils.invalidate();

			// A file dropped on Home makes a chat that is not on screen yet, and
			// the status line here goes with the form when the list replaces it.
			// Opening the chat is both the useful place to land and the only one
			// where the result survives.
			if (roomId) router.refresh();
			else router.push(`/rooms/${result.roomId}`);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Import failed.");
		} finally {
			setBusy(false);
			if (input.current) input.current.value = "";
		}
	}

	return (
		<div className="flex flex-col items-end gap-1">
			<input
				accept=".txt,text/plain"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) void upload(file);
				}}
				ref={input}
				type="file"
			/>
			<Button
				disabled={busy}
				onClick={() => input.current?.click()}
				size="sm"
				variant="outline"
			>
				{busy ? "Importing…" : label}
			</Button>
			{status ? (
				<p className="text-muted-foreground text-xs">{status}</p>
			) : null}
		</div>
	);
}
