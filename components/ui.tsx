"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
	className,
	variant = "solid",
	size = "md",
	...props
}: React.ComponentProps<"button"> & {
	variant?: "solid" | "outline" | "ghost";
	size?: "sm" | "md";
}) {
	return (
		<button
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-sm border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
				size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
				variant === "solid" &&
					"border-foreground bg-foreground text-background hover:opacity-85",
				variant === "outline" && "border-border bg-transparent hover:bg-accent",
				variant === "ghost" &&
					"border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			className={cn(
				"h-9 w-full rounded-sm border border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children
		<label className="block space-y-1.5">
			<span className="font-medium text-sm">{label}</span>
			{children}
			{error ? (
				<span className="block text-xs">{error}</span>
			) : hint ? (
				<span className="block text-muted-foreground text-xs">{hint}</span>
			) : null}
		</label>
	);
}

export function Table({ children }: { children: React.ReactNode }) {
	return (
		<div className="overflow-x-auto rounded-sm border border-border">
			<table className="w-full border-collapse text-sm">{children}</table>
		</div>
	);
}

export function Th({
	children,
	className,
}: {
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<th
			className={cn(
				"border-border border-b bg-muted px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide",
				className,
			)}
		>
			{children}
		</th>
	);
}

export function Td({
	children,
	className,
}: {
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<td className={cn("border-border border-b px-3 py-2 align-top", className)}>
			{children}
		</td>
	);
}

export function Empty({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-sm border border-border border-dashed p-10 text-center text-muted-foreground text-sm">
			{children}
		</div>
	);
}

export function HandleLink({
	handle,
	name,
}: {
	handle?: string | null;
	name?: string | null;
}) {
	if (!handle) return <span>{name ?? "Unknown"}</span>;

	// Only a phone number carries a +, and only WhatsApp identifies people by
	// one, so the handle itself says where it points.
	const phone = handle.startsWith("+");
	const label = phone ? handle : `@${handle}`;

	return (
		<a
			className="underline underline-offset-2 hover:no-underline"
			href={
				phone
					? `https://wa.me/${handle.replace(/\D/g, "")}`
					: `https://x.com/${handle}`
			}
			rel="noreferrer"
			target="_blank"
		>
			{name ? `${name} · ${label}` : label}
		</a>
	);
}

export function PeopleList({
	people,
}: {
	people: Array<{
		id: string;
		personName: string | null;
		personHandle: string | null;
		personEmail: string | null;
	}>;
}) {
	if (!people.length) return <span className="text-muted-foreground">—</span>;

	return (
		<ul className="space-y-1">
			{people.map((person) => (
				<li className="leading-tight" key={person.id}>
					<HandleLink handle={person.personHandle} name={person.personName} />
					{person.personEmail ? (
						<span className="text-muted-foreground">
							{" "}
							· {person.personEmail}
						</span>
					) : null}
				</li>
			))}
		</ul>
	);
}
