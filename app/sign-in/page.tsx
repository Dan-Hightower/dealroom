"use client";

import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

function SignInForm() {
	const searchParams = useSearchParams();
	const next = searchParams.get("next") ?? "/";

	const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in");
	const [name, setName] = React.useState("");
	const [email, setEmail] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);

		const result =
			mode === "sign-up"
				? await authClient.signUp.email({
						name: name || email,
						email,
						password,
					})
				: await authClient.signIn.email({ email, password });

		if (result.error) {
			// A 500 with no body almost always means the database is unreachable,
			// and the real error is only visible in the dev server's terminal.
			setError(
				result.error.message ||
					(result.error.status === 500
						? "The server could not complete that. This is usually the database not running — check the terminal where you started npm run dev, and see Troubleshooting in README.md."
						: `Sign in failed (${result.error.status ?? "unknown error"}).`),
			);
			setBusy(false);
			return;
		}

		// A full load, so the server sees the fresh session cookie.
		window.location.href = next;
	}

	return (
		<main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
			<h1 className="font-semibold text-xl tracking-tight">Deal Room</h1>
			<p className="mt-1 mb-8 text-muted-foreground text-sm">
				{mode === "sign-up"
					? "Create the account for this instance."
					: "Sign in to your instance."}
			</p>

			<form className="space-y-4" onSubmit={submit}>
				{mode === "sign-up" ? (
					<Field label="Name">
						<Input
							autoComplete="name"
							onChange={(event) => setName(event.target.value)}
							placeholder="Your name"
							value={name}
						/>
					</Field>
				) : null}

				<Field label="Email">
					<Input
						autoComplete="email"
						onChange={(event) => setEmail(event.target.value)}
						required
						type="email"
						value={email}
					/>
				</Field>

				<Field
					hint={mode === "sign-up" ? "At least 8 characters." : undefined}
					label="Password"
				>
					<Input
						autoComplete={
							mode === "sign-up" ? "new-password" : "current-password"
						}
						minLength={8}
						onChange={(event) => setPassword(event.target.value)}
						required
						type="password"
						value={password}
					/>
				</Field>

				{error ? <p className="text-sm">{error}</p> : null}

				<Button className="w-full" disabled={busy} type="submit">
					{busy ? "…" : mode === "sign-up" ? "Create account" : "Sign in"}
				</Button>
			</form>

			<Button
				className="mt-4"
				onClick={() => {
					setMode(mode === "sign-up" ? "sign-in" : "sign-up");
					setError(null);
				}}
				type="button"
				variant="ghost"
			>
				{mode === "sign-up"
					? "I already have an account"
					: "Create an account instead"}
			</Button>
		</main>
	);
}

export default function SignInPage() {
	// useSearchParams needs a boundary, or the whole route bails out of
	// prerendering at build time.
	return (
		<React.Suspense fallback={null}>
			<SignInForm />
		</React.Suspense>
	);
}
