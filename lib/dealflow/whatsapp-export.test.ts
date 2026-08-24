import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWhatsAppExport } from "./whatsapp-export.ts";

const stamp = (value: Date) =>
	`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

test("android, day first, 24 hour", () => {
	const { messages, dayFirst } = parseWhatsAppExport(
		[
			"20/08/2026, 20:37 - Minda Brusse: Halo AI is raising",
			"21/08/2026, 09:02 - Chris Lu: Understudy Labs (YC S26)",
		].join("\n"),
	);

	assert.equal(dayFirst, true);
	assert.equal(messages.length, 2);
	assert.equal(stamp(messages[0]!.sentAt), "2026-08-20 20:37");
	assert.equal(messages[0]!.authorName, "Minda Brusse");
	assert.equal(messages[0]!.text, "Halo AI is raising");
	assert.equal(stamp(messages[1]!.sentAt), "2026-08-21 09:02");
});

test("ios, brackets, seconds, month first", () => {
	const { messages, dayFirst } = parseWhatsAppExport(
		[
			"‎[8/20/26, 8:37:15 PM] Minda Brusse: Halo AI is raising",
			"[12/31/26, 11:59:00 AM] Chris Lu: last one",
		].join("\n"),
	);

	assert.equal(dayFirst, false);
	assert.equal(stamp(messages[0]!.sentAt), "2026-08-20 20:37");
	assert.equal(stamp(messages[1]!.sentAt), "2026-12-31 11:59");
});

test("german dots", () => {
	const { messages } = parseWhatsAppExport(
		"20.08.26, 20:37 - Minda Brusse: Halo AI is raising",
	);
	assert.equal(stamp(messages[0]!.sentAt), "2026-08-20 20:37");
});

test("midnight and noon in 12 hour clocks", () => {
	const { messages } = parseWhatsAppExport(
		[
			"8/20/26, 12:05 AM - A: midnight",
			"8/20/26, 12:05 PM - A: noon",
			"8/20/26, 11:30 p.m. - A: late",
		].join("\n"),
	);
	assert.equal(stamp(messages[0]!.sentAt), "2026-08-20 00:05");
	assert.equal(stamp(messages[1]!.sentAt), "2026-08-20 12:05");
	assert.equal(stamp(messages[2]!.sentAt), "2026-08-20 23:30");
});

test("an ambiguous file is read in the order it is written", () => {
	// Every field is under 13, so only the running order can decide. Day first
	// gives 3 Aug then 5 Aug; month first gives 8 Mar then 8 May, also forward,
	// and the tie goes to day first.
	const { dayFirst, messages } = parseWhatsAppExport(
		["3/8/26, 10:00 - A: one", "5/8/26, 10:00 - A: two"].join("\n"),
	);
	assert.equal(dayFirst, true);
	assert.equal(stamp(messages[0]!.sentAt), "2026-08-03 10:00");
});

test("a file that only runs forwards month first is read that way", () => {
	// Day first would read these as 8 March then 9 February, which runs
	// backwards; month first reads 3 August then 2 September, which does not.
	const { dayFirst, messages } = parseWhatsAppExport(
		["8/3/26, 10:00 - A: one", "9/2/26, 10:00 - A: two"].join("\n"),
	);
	assert.equal(dayFirst, false);
	assert.equal(stamp(messages[0]!.sentAt), "2026-08-03 10:00");
	assert.equal(stamp(messages[1]!.sentAt), "2026-09-02 10:00");
});

test("multi-line messages stay one message", () => {
	const { messages } = parseWhatsAppExport(
		[
			"20/08/2026, 20:37 - Minda Brusse: Halo AI is raising",
			"Third party risk management",
			"See gohalo.ai",
			"21/08/2026, 09:02 - Chris Lu: next",
		].join("\n"),
	);

	assert.equal(messages.length, 2);
	assert.equal(
		messages[0]!.text,
		"Halo AI is raising\nThird party risk management\nSee gohalo.ai",
	);
});

test("group system lines are classified, not treated as messages", () => {
	const { messages } = parseWhatsAppExport(
		[
			"20/08/2026, 09:00 - Messages and calls are end-to-end encrypted.",
			'20/08/2026, 09:01 - Minda Brusse created group "Deal share"',
			"20/08/2026, 09:02 - Minda Brusse added Chris Lu",
			"20/08/2026, 09:03 - +1 202 555 0123 joined using this group's invite link",
			"20/08/2026, 09:04 - Chris Lu left",
			"20/08/2026, 09:05 - Chris Lu: an actual message",
		].join("\n"),
	);

	assert.deepEqual(
		messages.map((message) => message.kind),
		["system", "system", "join", "join", "leave", "message"],
	);
});

test("an unsaved number becomes a handle, a saved name does not", () => {
	const { messages, participants } = parseWhatsAppExport(
		[
			"20/08/2026, 09:05 - +1 (202) 555-0123: from a number",
			"20/08/2026, 09:06 - Minda Brusse: from a name",
		].join("\n"),
	);

	assert.equal(messages[0]!.authorHandle, "+12025550123");
	assert.equal(messages[0]!.authorName, undefined);
	assert.equal(messages[1]!.authorHandle, undefined);
	assert.equal(messages[1]!.authorName, "Minda Brusse");
	assert.equal(participants.length, 2);
});

test("a colon inside a message does not become a sender", () => {
	const { messages } = parseWhatsAppExport(
		"20/08/2026, 09:05 - Minda Brusse: terms: $8M cap, see https://gohalo.ai",
	);

	assert.equal(messages[0]!.authorName, "Minda Brusse");
	assert.equal(messages[0]!.text, "terms: $8M cap, see https://gohalo.ai");
});

test("a header before any message is counted, not attached", () => {
	const { messages, skipped } = parseWhatsAppExport(
		["Chat exported from WhatsApp", "20/08/2026, 09:05 - A: hi"].join("\n"),
	);
	assert.equal(messages.length, 1);
	assert.equal(skipped, 1);
});

test("an empty file is not an error", () => {
	const { messages, skipped } = parseWhatsAppExport("");
	assert.equal(messages.length, 0);
	assert.equal(skipped, 0);
});

test("a named zone fixes the wall clock the file was written in", () => {
	// 20:37 on the phone in Los Angeles is 03:37 the next day in UTC. Parsed
	// without the zone, a server running in UTC would call it 20:37Z and show
	// the reader the wrong time.
	const { messages } = parseWhatsAppExport(
		"20/08/2026, 20:37 - A: evening in California",
		"America/Los_Angeles",
	);

	assert.equal(messages[0]!.sentAt.toISOString(), "2026-08-21T03:37:00.000Z");
});

test("daylight saving is resolved per message, not once for the file", () => {
	// 1 November 2026 is the Sunday US clocks go back: the same wall clock is
	// seven hours from UTC before it and eight hours after.
	const { messages } = parseWhatsAppExport(
		[
			"31/10/2026, 12:00 - A: before the change",
			"02/11/2026, 12:00 - A: after the change",
		].join("\n"),
		"America/Los_Angeles",
	);

	assert.equal(messages[0]!.sentAt.toISOString(), "2026-10-31T19:00:00.000Z");
	assert.equal(messages[1]!.sentAt.toISOString(), "2026-11-02T20:00:00.000Z");
});

test("a zone east of UTC is handled the same way", () => {
	const { messages } = parseWhatsAppExport(
		"20/08/2026, 09:00 - A: morning in Berlin",
		"Europe/Berlin",
	);
	assert.equal(messages[0]!.sentAt.toISOString(), "2026-08-20T07:00:00.000Z");
});
