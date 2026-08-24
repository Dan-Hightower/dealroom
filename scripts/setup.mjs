#!/usr/bin/env node
/**
 * One-command local bootstrap.
 *
 *   npm run setup
 *
 * Creates .env with a real auth secret, brings up a database, and applies
 * migrations. Safe to re-run: nothing here overwrites an existing .env.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const skipDb = process.argv.includes("--skip-db");

/** @param {string} message */
function say(message) {
	process.stdout.write(`${message}\n`);
}

/**
 * @param {number} n
 * @param {string} message
 */
function step(n, message) {
	say(`\n\x1b[1m[${n}/4]\x1b[0m ${message}`);
}

/** @param {string} message @returns {never} */
function fail(message) {
	process.stderr.write(`\n\x1b[31m${message}\x1b[0m\n`);
	process.exit(1);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import("node:child_process").SpawnSyncOptions} [options]
 */
function run(command, args, options = {}) {
	return (
		spawnSync(command, args, {
			cwd: root,
			stdio: "inherit",
			shell: process.platform === "win32",
			...options,
		}).status === 0
	);
}

/** @param {string} command */
function has(command) {
	try {
		execFileSync(process.platform === "win32" ? "where" : "which", [command], {
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Minimal .env reader. Deliberately does not expand ${VARS}: neither does the
 * dotenv this project uses, and pretending otherwise hides a real failure.
 * @param {string} file
 * @returns {Record<string, string>}
 */
function readEnvFile(file) {
	/** @type {Record<string, string>} */
	const values = {};
	if (!existsSync(file)) return values;

	for (const line of readFileSync(file, "utf8").split("\n")) {
		const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
		if (!match) continue;

		const [, key, rawValue = ""] = match;
		if (!key) continue;

		values[key] = rawValue
			.trim()
			.replace(/\s+#.*$/, "")
			.replace(/^["']|["']$/g, "");
	}

	return values;
}

step(1, "Checking your toolchain");

if (Number(process.versions.node.split(".")[0]) < 22) {
	fail(
		`Node 22+ is required, found ${process.versions.node}.\nWith nvm: nvm install 22 && nvm use 22`,
	);
}
say(`  Node ${process.versions.node}`);

if (existsSync(path.join(root, "node_modules"))) {
	say("  Dependencies already installed");
} else {
	say("  Installing dependencies (takes a minute)");
	if (!run("npm", ["install"])) fail("npm install failed.");
}

step(2, "Preparing .env");

if (existsSync(envPath)) {
	say("  .env already exists, leaving it alone");
} else {
	if (!existsSync(examplePath)) fail(".env.example is missing.");
	copyFileSync(examplePath, envPath);

	writeFileSync(
		envPath,
		readFileSync(envPath, "utf8")
			.replace(
				/^BETTER_AUTH_SECRET=.*$/m,
				`BETTER_AUTH_SECRET="${randomBytes(32).toString("base64")}"`,
			)
			.replace(
				/^CREDENTIALS_SECRET=.*$/m,
				`CREDENTIALS_SECRET="${randomBytes(32).toString("base64")}"`,
			),
	);

	say("  Created .env with freshly generated secrets");
}

const databaseUrl = readEnvFile(envPath).DATABASE_URL;

if (!databaseUrl) fail("DATABASE_URL is not set in .env.");

if (databaseUrl.includes("$" + "{")) {
	fail(
		"DATABASE_URL in .env still contains unexpanded placeholders.\n" +
			"Nothing expands those, so write the connection string out in full, e.g.\n" +
			'DATABASE_URL="postgresql://postgres:password@localhost:5432/dealroom"',
	);
}

step(3, "Getting a database ready");

let host = "";
try {
	host = new URL(databaseUrl).hostname;
} catch {
	fail(`DATABASE_URL is not a valid URL: ${databaseUrl}`);
}

if (skipDb) {
	say("  --skip-db passed, assuming the database is already running");
} else if (!LOCAL_HOSTS.has(host)) {
	say(`  Using the hosted database at ${host}`);
} else if (!has("docker")) {
	fail(
		"DATABASE_URL points at localhost but Docker is not installed.\n\n" +
			"Either install Docker Desktop, or create a free hosted database and put\n" +
			"its connection string in .env as DATABASE_URL. Neon (https://neon.tech)\n" +
			"works well: sign up, create a project, copy the connection string.",
	);
} else {
	say("  Starting Postgres via Docker");
	if (!run("docker", ["compose", "up", "-d"])) {
		fail("docker compose failed. Is Docker Desktop running?");
	}

	const { Client } = await import("pg");
	let ready = false;

	for (let attempt = 0; attempt < 30; attempt += 1) {
		const client = new Client({ connectionString: databaseUrl });
		try {
			await client.connect();
			await client.end();
			ready = true;
			break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	if (!ready) {
		fail(
			"Postgres did not accept connections within 30 seconds.\n" +
				"Check `npm run docker:logs` for what went wrong.",
		);
	}

	say("  Postgres is accepting connections");
}

step(4, "Applying database migrations");

if (
	!run("npx", ["prisma", "migrate", "deploy"], {
		env: { ...process.env, DATABASE_URL: databaseUrl },
	})
) {
	fail("prisma migrate deploy failed. See the error above.");
}

say(`
\x1b[32mSetup complete.\x1b[0m

  npm run dev      Start the app on http://localhost:3000

Create your account on the sign-in page, then open Settings and connect X.
Your chats show up on Home to pick from.
`);
