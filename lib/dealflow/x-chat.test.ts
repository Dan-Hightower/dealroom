import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockX } from "../../test/mock-x.ts";
import { readXConversation } from "./x-chat.ts";

/**
 * Covers the half of the reader that is ordinary code: paging the events,
 * putting handles on them, and getting the order right. The decryption is
 * stubbed — unlocking a real account's keys needs Juicebox and a PIN, and a
 * test that faked that would be testing the fake.
 */

/** Reads back what the mock encoded, standing in for the crypto. */
const decrypter = {
	decryptEvents(events: string[]) {
		return {
			messages: events.flatMap((raw) => {
				let parsed: Record<string, string>;
				try {
					parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
				} catch {
					// The key events are not messages, exactly as in the real thing.
					return [];
				}

				return [
					{
						event: {
							type: "message",
							id: parsed.id,
							senderId: parsed.sender,
							createdAtMsec: new Date(parsed.at as string).getTime(),
							content: { text: parsed.text },
						},
					},
				];
			}),
			errors: {},
		};
	},
};

async function withMockX(
	run: (base: string, mock: ReturnType<typeof createMockX>) => Promise<void>,
	options?: { pageSize?: number },
) {
	const mock = createMockX(options);
	await new Promise<void>((resolve) => {
		mock.server.listen(0, () => resolve());
	});
	const port = (mock.server.address() as { port: number }).port;

	try {
		await run(`http://localhost:${port}`, mock);
	} finally {
		mock.server.close();
	}
}

const credentialsFor = (base: string) => ({
	xClientId: null,
	xAccessToken: "the-users-own-token",
	xRefreshToken: null,
	xTokenExpiresAt: null,
	xUserId: "111",
	xUsername: "mindabrusse",
	xChatPin: "1234",
	xChatJuiceboxConfig: null,
	xaiApiKey: null,
	baseUrl: base,
});

test("pages the whole conversation and puts it in the order it happened", async () => {
	await withMockX(async (base, mock) => {
		process.env.X_API_BASE_URL = base;

		const read = await readXConversation({
			credentials: credentialsFor(base),
			conversationId: mock.CONVERSATION,
			openChat: async () => decrypter,
		});

		// Five messages over three pages of two.
		assert.equal(read.messages.length, 5);
		assert.ok(
			mock.seen.pages >= 3,
			`expected paging, made ${mock.seen.pages} calls`,
		);
		assert.equal(read.reachedStart, true);

		const times = read.messages.map((message) => message.sentAtIso ?? "");
		assert.deepEqual(
			[...times].sort(),
			times,
			"messages must run oldest first",
		);

		assert.equal(read.messages[0]?.sentAtIso, "2026-08-20T20:37:00.000Z");
		assert.match(read.messages[0]?.text ?? "", /Halo AI/);
		assert.equal(read.messages[0]?.authorHandle, "mindabrusse");
		assert.equal(read.messages[0]?.authorName, "Minda Brusse");
		assert.equal(read.messages[0]?.externalId, "e1");
		assert.equal(
			read.messages[0]?.outgoing,
			true,
			"sent by the connected account",
		);
		assert.equal(read.messages[1]?.outgoing, false);
		assert.equal(read.title, "Angel deal share");
	});
});

test("carries the account's own token, never anything else", async () => {
	await withMockX(async (base, mock) => {
		process.env.X_API_BASE_URL = base;

		await readXConversation({
			credentials: credentialsFor(base),
			conversationId: mock.CONVERSATION,
			openChat: async () => decrypter,
		});

		assert.ok(mock.seen.auth.length > 0);
		for (const header of mock.seen.auth) {
			assert.equal(header, "Bearer the-users-own-token");
		}
	});
});

test("a cap stops the read and says so rather than pretending it finished", async () => {
	await withMockX(async (base, mock) => {
		process.env.X_API_BASE_URL = base;

		const read = await readXConversation({
			credentials: credentialsFor(base),
			conversationId: mock.CONVERSATION,
			maxEvents: 2,
			openChat: async () => decrypter,
		});

		assert.equal(read.messages.length, 2);
		assert.equal(read.reachedStart, false);
	});
});

test("everyone who spoke becomes a participant", async () => {
	await withMockX(async (base, mock) => {
		process.env.X_API_BASE_URL = base;

		const read = await readXConversation({
			credentials: credentialsFor(base),
			conversationId: mock.CONVERSATION,
			openChat: async () => decrypter,
		});

		assert.deepEqual(read.participants.map((person) => person.handle).sort(), [
			"chris__lu",
			"magicofazi",
			"mindabrusse",
		]);
		assert.equal(
			read.participants.find((p) => p.handle === "chris__lu")?.profileUrl,
			"https://x.com/chris__lu",
		);
	});
});
