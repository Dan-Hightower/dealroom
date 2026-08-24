import assert from "node:assert/strict";
import { test } from "node:test";

process.env.CREDENTIALS_SECRET = "test-secret-test-secret-test-sec";

const { decryptSecret, encryptSecret, maskSecret } = await import(
	"./secrets.ts"
);

test("a secret survives a round trip", () => {
	const value = "xai-abcdef1234567890";
	assert.equal(decryptSecret(encryptSecret(value)), value);
});

test("the same secret encrypts differently every time", () => {
	// A fixed nonce would let somebody match two users with the same key.
	assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("a tampered payload is refused rather than half decrypted", () => {
	const encrypted = encryptSecret("xai-abcdef1234567890");
	const parts = encrypted.split(".");
	const flipped = [...parts];
	flipped[3] = `${parts[3]!.slice(0, -2)}AA`;

	assert.equal(decryptSecret(flipped.join(".")), null);
	assert.equal(decryptSecret("nonsense"), null);
	assert.equal(decryptSecret(""), null);
});

test("the wrong secret does not decrypt", async () => {
	const encrypted = encryptSecret("xai-abcdef1234567890");

	process.env.CREDENTIALS_SECRET = "a-completely-different-secret-32";
	const other = await import(`./secrets.ts?other=${Date.now()}`);
	assert.equal(other.decryptSecret(encrypted), null);

	process.env.CREDENTIALS_SECRET = "test-secret-test-secret-test-sec";
});

test("masking shows enough to recognise a key and not enough to use it", () => {
	assert.equal(maskSecret("xai-abcdef1234567890"), "xai-••••7890");
	assert.equal(maskSecret("short"), "••••");
	assert.equal(maskSecret(null), null);
});
