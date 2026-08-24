import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDate(value?: Date | string | null) {
	if (!value) return "—";
	const date = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(date.getTime())
		? "—"
		: new Intl.DateTimeFormat("en-GB", {
				day: "numeric",
				month: "short",
				year: "numeric",
			}).format(date);
}

export function formatDateTime(value?: Date | string | null) {
	if (!value) return "never";
	const date = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(date.getTime())
		? "never"
		: new Intl.DateTimeFormat("en-GB", {
				day: "numeric",
				month: "short",
				hour: "2-digit",
				minute: "2-digit",
			}).format(date);
}
