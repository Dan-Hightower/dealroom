"use client";

import * as React from "react";
import { Button, Empty, Table, Td, Th } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * One column definition drives three things: how the cell renders, how the
 * column sorts, and what lands in the export. Keeping them together is what
 * stops the spreadsheet drifting from the screen.
 */
export type Column<T> = {
	key: string;
	header: string;
	/** Sort key and export value. Keep it primitive. */
	value: (row: T) => string | number | Date | null | undefined;
	/** Optional richer rendering. Falls back to value(). */
	cell?: (row: T) => React.ReactNode;
	align?: "right";
	className?: string;
};

type Direction = "asc" | "desc";

function compare(a: unknown, b: unknown) {
	// Empty cells sort last in either direction; they are absence, not zero.
	const aEmpty = a === null || a === undefined || a === "";
	const bEmpty = b === null || b === undefined || b === "";
	if (aEmpty && bEmpty) return 0;
	if (aEmpty) return 1;
	if (bEmpty) return -1;

	if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
	if (typeof a === "number" && typeof b === "number") return a - b;

	return String(a).localeCompare(String(b), undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

/**
 * Dates render in the reader's own timezone. toISOString() would be UTC, which
 * pushes anything sent after early evening in the Americas onto the next day —
 * a message sent on the 20th showing as the 21st, or as tomorrow.
 */
function toCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) {
		return [
			value.getFullYear(),
			String(value.getMonth() + 1).padStart(2, "0"),
			String(value.getDate()).padStart(2, "0"),
		].join("-");
	}
	return String(value);
}

/**
 * Text out of a chat is not trusted input. Excel treats a cell starting with
 * =, +, - or @ as a formula, so somebody could put =HYPERLINK(...) in a
 * message and have it run when you open the export. Numbers keep their sign;
 * only text is defused.
 */
function defuse(value: unknown, rendered: string): string {
	return typeof value === "string" && /^[=+\-@\t\r]/.test(rendered)
		? `'${rendered}`
		: rendered;
}

/** RFC 4180 quoting, plus a BOM so Excel reads UTF-8 rather than guessing. */
function toCsv<T>(columns: Column<T>[], rows: T[]): string {
	const quote = (value: string) =>
		/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

	const cell = <R,>(column: Column<R>, row: R) => {
		const raw = column.value(row);
		return quote(defuse(raw, toCell(raw)));
	};

	const lines = [
		columns.map((column) => quote(column.header)).join(","),
		...rows.map((row) => columns.map((column) => cell(column, row)).join(",")),
	];

	return `﻿${lines.join("\r\n")}`;
}

function download(filename: string, contents: string) {
	const url = URL.createObjectURL(
		new Blob([contents], { type: "text/csv;charset=utf-8;" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

export function DataTable<T extends { id: string }>({
	columns,
	rows,
	empty,
	filename,
}: {
	columns: Column<T>[];
	rows: T[];
	empty: string;
	filename: string;
}) {
	const [sort, setSort] = React.useState<{
		key: string;
		dir: Direction;
	} | null>(null);

	const sorted = React.useMemo(() => {
		if (!sort) return rows;
		const column = columns.find((c) => c.key === sort.key);
		if (!column) return rows;

		return [...rows].sort((a, b) => {
			const result = compare(column.value(a), column.value(b));
			return sort.dir === "asc" ? result : -result;
		});
	}, [rows, sort, columns]);

	function toggle(key: string) {
		setSort((current) =>
			current?.key === key
				? current.dir === "asc"
					? { key, dir: "desc" }
					: null
				: { key, dir: "asc" },
		);
	}

	if (!rows.length) return <Empty>{empty}</Empty>;

	return (
		<div className="space-y-3">
			<div className="flex justify-end">
				<Button
					onClick={() =>
						download(
							`${filename}-${new Date().toISOString().slice(0, 10)}.csv`,
							toCsv(columns, sorted),
						)
					}
					size="sm"
					variant="outline"
				>
					Export
				</Button>
			</div>

			<Table>
				<thead>
					<tr>
						{columns.map((column) => {
							const active = sort?.key === column.key;
							return (
								<Th
									className={cn(
										"cursor-pointer select-none hover:text-foreground",
										column.align === "right" && "text-right",
									)}
									key={column.key}
								>
									<button
										className="inline-flex items-center gap-1"
										onClick={() => toggle(column.key)}
										type="button"
									>
										{column.header}
										<span
											aria-hidden
											className={cn(
												"text-[0.7em]",
												active ? "opacity-100" : "opacity-25",
											)}
										>
											{active && sort?.dir === "desc" ? "▼" : "▲"}
										</span>
									</button>
								</Th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => (
						<tr key={row.id}>
							{columns.map((column) => (
								<Td
									className={cn(
										column.align === "right" && "text-right tabular-nums",
										column.className,
									)}
									key={column.key}
								>
									{column.cell
										? column.cell(row)
										: toCell(column.value(row)) || (
												<span className="text-muted-foreground">—</span>
											)}
								</Td>
							))}
						</tr>
					))}
				</tbody>
			</Table>
		</div>
	);
}
