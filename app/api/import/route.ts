import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importChatExport } from "@/lib/dealflow/service";

// A long history plus a full extraction pass takes a while.
export const maxDuration = 300;

// WhatsApp caps an export at 40,000 messages. Ten megabytes covers that with
// room to spare, and stops anything larger from being read into memory.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const form = await request.formData();
	const file = form.get("file");
	const roomId = form.get("roomId");
	const name = form.get("name");
	const timeZone = form.get("timeZone");

	if (!(file instanceof File)) {
		return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
	}

	if (file.size > MAX_BYTES) {
		return NextResponse.json(
			{ error: "That file is over 10MB. Export the chat without media." },
			{ status: 413 },
		);
	}

	try {
		const result = await importChatExport({
			userId: session.user.id,
			roomId: typeof roomId === "string" && roomId ? roomId : undefined,
			name:
				typeof name === "string" && name
					? name
					: file.name
							.replace(/\.txt$/i, "")
							.replace(/^whatsapp chat (?:with|-)\s*/i, "")
							.trim(),
			text: await file.text(),
			timeZone: typeof timeZone === "string" ? timeZone : undefined,
		});

		return NextResponse.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Import failed";
		console.error("Chat import failed:", message);
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
