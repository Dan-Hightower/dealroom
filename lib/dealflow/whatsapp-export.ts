/**
 * Reads a chat exported from WhatsApp.
 *
 * WhatsApp's own "Export chat" is the only way to get a group's whole history:
 * a newly linked device is sent recent messages and nothing older, and the web
 * client will only reach back about three months. The file it writes is plain
 * text, one message per line, and it carries the group system messages too —
 * which is where join dates come from.
 *
 * The format is not one format. It follows the phone's locale and platform:
 *
 *   Android   20/08/2026, 20:37 - Minda Brusse: Halo AI is raising
 *   iOS       [20/08/2026, 20:37:15] Minda Brusse: Halo AI is raising
 *   US        8/20/26, 8:37 PM - Minda Brusse: Halo AI is raising
 *   German    20.08.26, 20:37 - Minda Brusse: Halo AI is raising
 *
 * so the parser reads the shape from the file rather than assuming one.
 */

export type ParsedExportMessage = {
	authorHandle?: string;
	authorName?: string;
	kind: "message" | "join" | "leave" | "system";
	sentAt: Date;
	sentAtLabel: string;
	sequence: number;
	text: string;
};

export type ParsedExport = {
	messages: ParsedExportMessage[];
	participants: { handle?: string; name?: string; profileUrl?: string }[];
	/** Lines that did not start a message and had nothing to attach to. */
	skipped: number;
	dayFirst: boolean;
};

/**
 * The head of a line: an optional bracket, a date, a time, an optional
 * seconds, an optional meridiem, then the separator before the body. iOS wraps
 * it in brackets, Android follows it with " - ".
 */
const HEAD =
	/^‎?\[?(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\]?\s*(?:-\s*)?/i;

/** Everything WhatsApp writes about the group rather than in it. */
const SYSTEM = [
	{ kind: "join" as const, test: /joined using this group's invite link/i },
	{ kind: "join" as const, test: /\badded\b/i },
	{ kind: "leave" as const, test: /\bleft\b$/i },
	{ kind: "leave" as const, test: /\bremoved\b/i },
	{ kind: "system" as const, test: /created (this )?group/i },
	{
		kind: "system" as const,
		test: /changed (the )?(subject|group|their phone)/i,
	},
	{ kind: "system" as const, test: /end-to-end encrypted/i },
	{ kind: "system" as const, test: /changed to \+/i },
	{ kind: "system" as const, test: /(is|are) now an admin/i },
	{ kind: "system" as const, test: /security code changed/i },
	{
		kind: "system" as const,
		test: /deleted this message|message was deleted/i,
	},
];

const PHONE = /^\+[\d\s().-]{6,20}$/;

function clean(value: string) {
	// Exports are peppered with bidi marks that are invisible but not absent.
	return value.replace(/[‎‏‪-‮]/g, "").trim();
}

type Head = {
	a: number;
	b: number;
	year: number;
	hour: number;
	minute: number;
	second: number;
	rest: string;
	label: string;
};

function readHead(line: string): Head | undefined {
	const match = HEAD.exec(line);
	if (!match) return undefined;

	const [, one, two, three, hh, mm, ss, meridiem] = match;
	if (!one || !two || !three || !hh || !mm) return undefined;

	let hour = Number(hh);
	const flag = meridiem?.replace(/\./g, "").toLowerCase();
	if (flag === "pm" && hour < 12) hour += 12;
	if (flag === "am" && hour === 12) hour = 0;

	// A four digit first field is a year, as in 2026-08-20.
	const isoOrder = one.length === 4;
	const year = Number(isoOrder ? one : three);

	return {
		a: Number(isoOrder ? two : one),
		b: Number(isoOrder ? three : two),
		year: year < 100 ? 2000 + year : year,
		hour,
		minute: Number(mm),
		second: Number(ss ?? 0),
		rest: line.slice(match[0].length),
		label: clean(match[0])
			.replace(/[[\]]|-\s*$/g, "")
			.trim(),
	};
}

/**
 * How far the named zone was from UTC at a given instant.
 *
 * Intl is the only thing here that knows about daylight saving. Formatting an
 * instant into the zone and reading the answer back as if it were UTC gives
 * the offset that applied on that date.
 */
function offsetAt(utcMs: number, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(new Date(utcMs));

	const at = (type: string) =>
		Number(parts.find((part) => part.type === type)?.value ?? 0);

	return (
		Date.UTC(
			at("year"),
			at("month") - 1,
			at("day"),
			at("hour"),
			at("minute"),
			at("second"),
		) - utcMs
	);
}

/**
 * Turns the wall clock an export was written in into a real instant.
 *
 * The file carries no timezone: 20:37 means 20:37 wherever the phone was.
 * Parsed on a server running in UTC that becomes 20:37Z, which shows as
 * lunchtime to a reader in California. So the caller says which zone the file
 * belongs to, and the offset is resolved against each message's own date —
 * which is what makes a history spanning a clock change come out right.
 */
function toDate(head: Head, dayFirst: boolean, timeZone?: string) {
	const day = dayFirst ? head.a : head.b;
	const month = dayFirst ? head.b : head.a;

	if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

	if (!timeZone) {
		const local = new Date(
			head.year,
			month - 1,
			day,
			head.hour,
			head.minute,
			head.second,
		);
		return local.getDate() === day && local.getMonth() === month - 1
			? local
			: undefined;
	}

	const asUtc = Date.UTC(
		head.year,
		month - 1,
		day,
		head.hour,
		head.minute,
		head.second,
	);

	// Rejects an impossible day, which Date.UTC rolls over instead.
	if (new Date(asUtc).getUTCDate() !== day) return undefined;

	// The offset is read again at the corrected instant, because the first
	// guess can land on the other side of a clock change.
	const once = asUtc - offsetAt(asUtc, timeZone);
	return new Date(asUtc - offsetAt(once, timeZone));
}

/**
 * Decides whether the file writes the day or the month first.
 *
 * Any field over twelve settles it outright. When every date is ambiguous —
 * a short chat inside the first twelve days of a month — fall back on the one
 * thing an export guarantees: it is in order. Whichever reading runs forwards
 * is the right one, and day-first breaks the tie, being what most of the world
 * writes.
 */
function readsDayFirst(heads: Head[], timeZone?: string) {
	for (const head of heads) {
		if (head.a > 12) return true;
		if (head.b > 12) return false;
	}

	const ordered = (dayFirst: boolean) => {
		let previous = 0;
		for (const head of heads) {
			const time = toDate(head, dayFirst, timeZone)?.getTime();
			if (time === undefined || time < previous) return false;
			previous = time;
		}
		return true;
	};

	return ordered(true) || !ordered(false);
}

/** "Alice added Bob" is about the group; "Alice: hi" is a message in it. */
function classify(body: string, hasAuthor: boolean) {
	if (hasAuthor) return "message" as const;
	return SYSTEM.find((rule) => rule.test.test(body))?.kind ?? "system";
}

/**
 * Splits "Name: text" off the front of a line.
 *
 * A system line has no author, but so does a message whose text happens to
 * contain a colon, so the name is only taken when it is short and free of the
 * punctuation a sentence would carry.
 */
function splitAuthor(body: string) {
	const at = body.indexOf(": ");
	if (at < 1 || at > 80) return { body };

	const name = body.slice(0, at).trim();
	if (!name || /[\n\t]/.test(name)) return { body };

	return { name, body: body.slice(at + 2) };
}

export function parseWhatsAppExport(
	raw: string,
	/** The zone the phone that wrote the file was in. Defaults to this runtime's. */
	timeZone?: string,
): ParsedExport {
	const lines = raw.split(/\r?\n/);
	const heads: (Head | undefined)[] = lines.map(readHead);
	const dayFirst = readsDayFirst(
		heads.filter((head) => head !== undefined),
		timeZone,
	);

	const messages: ParsedExportMessage[] = [];
	const participants = new Map<string, { handle?: string; name?: string }>();
	let skipped = 0;

	lines.forEach((line, index) => {
		const head = heads[index];

		if (!head) {
			// A message can run over several lines. Anything before the first
			// message belongs to nothing.
			const previous = messages.at(-1);
			const text = line.replace(/[‎‏]/g, "");

			if (previous && text.trim()) {
				previous.text = `${previous.text}\n${text}`.slice(0, 8000);
			} else if (text.trim()) {
				skipped += 1;
			}
			return;
		}

		const sentAt = toDate(head, dayFirst, timeZone);
		if (!sentAt) {
			skipped += 1;
			return;
		}

		const { name, body } = splitAuthor(clean(head.rest));
		const kind = classify(body, Boolean(name));
		// Someone not in your contacts appears as their number, written the way
		// their country writes it. E.164 is what the rest of the app expects.
		const handle =
			name && PHONE.test(name) ? `+${name.replace(/\D/g, "")}` : undefined;

		if (name) {
			const key = handle ?? name.toLowerCase();
			if (!participants.has(key))
				participants.set(key, { handle, name: handle ? undefined : name });
		}

		messages.push({
			authorHandle: handle,
			authorName: handle ? undefined : name,
			kind,
			sentAt,
			sentAtLabel: head.label,
			sequence: messages.length,
			text: body.slice(0, 8000),
		});
	});

	return {
		messages,
		participants: Array.from(participants.values()),
		skipped,
		dayFirst,
	};
}
