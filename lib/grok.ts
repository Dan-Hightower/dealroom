import "server-only";

const DEFAULT_BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";

/** Whose key pays for extraction. Everyone brings their own. */
export type GrokAccess = { apiKey: string; baseUrl?: string };

type GrokResponse = {
	output_text?: string;
	output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
};

export function isGrokConfigured(access?: GrokAccess | null): boolean {
	return Boolean(access?.apiKey);
}

function textFrom(response: GrokResponse): string {
	if (response.output_text) return response.output_text;

	for (const output of response.output ?? []) {
		for (const content of output.content ?? []) {
			if (content.text) return content.text;
		}
	}

	return "";
}

/** Ask Grok for JSON matching a schema, and return it parsed. */
export async function askGrokForJson(input: {
	system: string;
	user: string;
	schemaName: string;
	schema: Record<string, unknown>;
	access: GrokAccess;
}): Promise<unknown> {
	const apiKey = input.access.apiKey;
	if (!apiKey) throw new Error("No model key. Add one in Settings.");

	const baseUrl = (input.access.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

	const response = await fetch(`${baseUrl}/responses`, {
		method: "POST",
		// Without this a hung request stalls the whole sync with no explanation.
		signal: AbortSignal.timeout(120_000),
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: process.env.XAI_MODEL ?? "grok-4.5",
			store: false,
			input: [
				{ role: "system", content: input.system },
				{ role: "user", content: input.user },
			],
			text: {
				format: {
					type: "json_schema",
					name: input.schemaName,
					schema: input.schema,
					strict: true,
				},
			},
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Grok request failed with ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
		);
	}

	const text = textFrom((await response.json()) as GrokResponse);
	if (!text) throw new Error("Grok returned no JSON.");

	return JSON.parse(text) as unknown;
}
