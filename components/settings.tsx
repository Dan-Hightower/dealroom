"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Button, Field, Input } from "@/components/ui";
import { trpc } from "@/trpc/client";

/**
 * Where somebody puts their own API keys.
 *
 * Deal Room reads X through the X Chat API and extracts with a model, and both
 * bill whoever's key makes the call. Everyone running this brings their own —
 * there is no shared key and no allowance to borrow.
 */
export function Settings() {
	const params = useSearchParams();
	const utils = trpc.useUtils();
	const credentials = trpc.credentials.useQuery();
	const save = trpc.saveCredentials.useMutation();

	const [xClientId, setXClientId] = React.useState("");
	const [xChatPin, setXChatPin] = React.useState("");
	const [xaiApiKey, setXaiApiKey] = React.useState("");
	const [status, setStatus] = React.useState<string | null>(null);

	const data = credentials.data;
	const error = params.get("error");
	const connected = params.get("connected");

	async function update(patch: Record<string, string | undefined>) {
		setStatus(null);
		await save.mutateAsync(patch);
		await utils.credentials.invalidate();
		setStatus("Saved.");
	}

	if (credentials.isPending) {
		return <p className="p-8 text-muted-foreground text-sm">Loading…</p>;
	}

	return (
		<div className="mx-auto max-w-2xl space-y-10 px-6 py-10">
			<header>
				<Link
					className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
					href="/"
				>
					← All chats
				</Link>
				<h1 className="mt-3 font-semibold text-xl tracking-tight">Settings</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Deal Room runs on two APIs: X, to read the chat, and a model, to read
					the messages into deals. Both bill whoever's key makes the call.
				</p>
			</header>

			{error ? (
				<p className="border border-border p-3 text-sm">
					{error === "no-client-id"
						? "Add your X app's client id below before connecting."
						: error === "oauth-state"
							? "That sign-in did not come back cleanly. Try connecting again."
							: error}
				</p>
			) : null}
			{connected ? (
				<p className="border border-border p-3 text-sm">
					Connected to X as @{data?.xUsername}.
				</p>
			) : null}

			<section className="space-y-4">
				<div>
					<h2 className="font-semibold tracking-tight">X</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Create an app at developer.x.com with OAuth 2.0, set its callback to
						this instance's /api/x/oauth/callback, and paste the client id.
						Reads are billed to that app, so they are on your own account.
					</p>
				</div>

				<Field hint="From your X app's Keys and tokens tab." label="Client id">
					<Input
						onChange={(event) => setXClientId(event.target.value)}
						placeholder="a1b2c3…"
						value={xClientId}
					/>
				</Field>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						disabled={save.isPending || !xClientId}
						onClick={() => update({ xClientId })}
						size="sm"
						variant="outline"
					>
						Save client id
					</Button>

					<a
						className="inline-flex h-8 items-center rounded-sm border border-foreground bg-foreground px-3 font-medium text-background text-xs"
						href="/api/x/oauth/start"
					>
						{data?.hasXAccess ? "Reconnect X" : "Connect X"}
					</a>

					{data?.hasXAccess ? (
						<span className="text-muted-foreground text-xs">
							Connected as @{data.xUsername}
						</span>
					) : null}
				</div>
			</section>

			<section className="space-y-4 border-border border-t pt-8">
				<div>
					<h2 className="font-semibold tracking-tight">XChat PIN</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Your chats are end-to-end encrypted, so X only ever hands over
						ciphertext. The PIN you set in the X app unlocks the keys that
						decrypt it. It is stored encrypted on this machine and is sent
						nowhere.
					</p>
				</div>

				<Field
					hint={
						data?.hasXChatPin
							? "A PIN is saved."
							: "The PIN from XChat, not your account password."
					}
					label="PIN"
				>
					<Input
						onChange={(event) => setXChatPin(event.target.value)}
						type="password"
						value={xChatPin}
					/>
				</Field>

				<div className="flex gap-2">
					<Button
						disabled={save.isPending || !xChatPin}
						onClick={() => update({ xChatPin })}
						size="sm"
						variant="outline"
					>
						Save PIN
					</Button>
					{data?.hasXChatPin ? (
						<Button
							onClick={() => update({ xChatPin: "" })}
							size="sm"
							variant="ghost"
						>
							Forget it
						</Button>
					) : null}
				</div>
			</section>

			<section className="space-y-4 border-border border-t pt-8">
				<div>
					<h2 className="font-semibold tracking-tight">Model</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Reads the captured messages into startups, deals, sources and
						interest. Without one the messages are still stored, just never
						interpreted. Create a key at console.x.ai.
					</p>
				</div>

				<Field
					hint={data?.xaiApiKey ? `Saved: ${data.xaiApiKey}` : undefined}
					label="xAI API key"
				>
					<Input
						onChange={(event) => setXaiApiKey(event.target.value)}
						placeholder="xai-…"
						type="password"
						value={xaiApiKey}
					/>
				</Field>

				<Button
					disabled={save.isPending || !xaiApiKey}
					onClick={() => update({ xaiApiKey })}
					size="sm"
					variant="outline"
				>
					Save key
				</Button>
			</section>

			{status ? (
				<p className="text-muted-foreground text-sm">{status}</p>
			) : null}
		</div>
	);
}
