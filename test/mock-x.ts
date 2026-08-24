import { createServer, type ServerResponse } from "node:http";

/**
 * Stands in for api.x.com. Serves the shapes the XDK expects so the reader,
 * its pagination and the ingest can be exercised without a live account.
 * Decryption is stubbed separately — this only has to produce ciphertext-
 * shaped strings and the metadata around them.
 */

const CONVERSATION = "g1770000000000000001";
const ME = "111";

const MESSAGES = [
	{
		id: "e1",
		sender: "111",
		at: "2026-08-20T20:37:00Z",
		text: "I'm talking to Halo AI abt their solution around third party risk management in regulated verticals. See gohalo.ai",
	},
	{
		id: "e2",
		sender: "222",
		at: "2026-08-21T09:02:00Z",
		text: "Understudy Labs (YC S26) captures your AI work traces and automatically deploys them. Raising $4M seed.",
	},
	{
		id: "e3",
		sender: "333",
		at: "2026-08-21T11:15:00Z",
		text: "I'd be interested in Understudy. My email is azi@example.com",
	},
	{
		id: "e4",
		sender: "222",
		at: "2026-08-22T14:00:00Z",
		text: "My portfolio companies include Northwind and Cobalt Systems",
	},
	{
		id: "e5",
		sender: "111",
		at: "2026-08-23T10:30:00Z",
		text: "I run a syndicate for pre-seed AI deals, happy to add people. It's called Foundry Collective.",
	},
];

const USERS: Record<string, { id: string; name: string; username: string }> = {
	111: { id: "111", name: "Minda Brusse", username: "mindabrusse" },
	222: { id: "222", name: "Chris Lu", username: "chris__lu" },
	333: { id: "333", name: "Azi", username: "magicofazi" },
};

const json = (res: ServerResponse, status: number, body: unknown) => {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json",
		"content-length": Buffer.byteLength(payload),
	});
	res.end(payload);
};

// The reader hands whatever it collects to the decryption library; the stub
// decrypter reads this shape back out.
const encode = (m: unknown) =>
	Buffer.from(JSON.stringify(m)).toString("base64");

export function createMockX({ pageSize = 2 }: { pageSize?: number } = {}) {
	const seen: { pages: number; auth: (string | undefined)[] } = {
		pages: 0,
		auth: [],
	};

	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		seen.auth.push(req.headers.authorization);

		if (url.pathname === `/2/chat/conversations/${CONVERSATION}/events`) {
			seen.pages += 1;
			const offset = Number(url.searchParams.get("pagination_token") ?? "0");
			const slice = MESSAGES.slice(offset, offset + pageSize);
			const next = offset + pageSize;

			return json(res, 200, {
				data: slice.map((m) => ({
					id: m.id,
					conversation_id: CONVERSATION,
					sender_id: m.sender,
					created_at: m.at,
					encoded_event: encode(m),
					is_trusted: true,
				})),
				meta: {
					conversationKeyEvents: offset === 0 ? ["keyevent-v1"] : [],
					hasMore: next < MESSAGES.length,
					nextToken: next < MESSAGES.length ? String(next) : undefined,
					resultCount: slice.length,
				},
			});
		}

		if (url.pathname === "/2/chat/conversations") {
			return json(res, 200, {
				data: [{ id: CONVERSATION, name: "Angel deal share" }],
			});
		}

		if (url.pathname === `/2/chat/conversations/${CONVERSATION}`) {
			return json(res, 200, {
				data: {
					id: CONVERSATION,
					name: "Angel deal share",
					participant_ids: ["111", "222", "333"],
				},
			});
		}

		if (
			url.pathname === "/2/users/public_keys" ||
			url.pathname.endsWith("/public_keys")
		) {
			const ids = (url.searchParams.get("ids") ?? "111,222,333").split(",");
			return json(res, 200, {
				data: ids.map((id) => ({
					id,
					user_id: id,
					public_key_version: "v1",
					signing_public_key: `signing-${id}`,
					identity_public_key: `identity-${id}`,
					identity_public_key_signature: `sig-${id}`,
					...(id === ME
						? {
								juicebox_config: {
									key_store_token_map_json: JSON.stringify({
										token_map: { realm1: "realm-token" },
									}),
								},
							}
						: {}),
				})),
			});
		}

		if (url.pathname === "/2/users") {
			const ids = (url.searchParams.get("ids") ?? "")
				.split(",")
				.filter(Boolean);
			return json(res, 200, {
				data: ids.map((id) => USERS[id]).filter(Boolean),
			});
		}

		return json(res, 404, {
			errors: [{ detail: `no mock for ${url.pathname}` }],
		});
	});

	return { server, seen, CONVERSATION, MESSAGES, ME };
}
