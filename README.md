# Deal Room

Persist your X and WhatsApp group chats.

Everything runs on your own machine against your own database.

## What it gives you

Home lists every chat you track. Each one gets its own set of directories:

| Directory | Holds |
| --- | --- |
| **Members** | Everyone in the chat, their handle, the intro they posted when they joined, an email if they shared one, and when they joined |
| **Startups** | Every company discussed: name, handle, website, what it does, sector |
| **Deals** | Each time somebody shared a startup: who shared it, the pitch, terms, round, and everyone who expressed interest |
| **Sources** | Syndicates, funds, SPVs and scout programs people offered, who runs them, and who asked to join |

## Run it

You need [Node 22](https://nodejs.org), Chrome, and either Docker or a free
hosted Postgres.

```bash
git clone <this repo>
cd dealroom
npm run setup     # writes .env, starts Postgres, applies migrations
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and
you are in. There is no email verification and no invite step — this instance
is yours.

`npm run setup` is safe to re-run and never overwrites an existing `.env`.

### Choosing a database

Setup starts Postgres in Docker by default and needs no accounts.

If you would rather not run Docker, put a hosted connection string in `.env` as
`DATABASE_URL` **before** running setup and it will use that instead:

| Provider | Free tier | Where to find the URL |
| --- | --- | --- |
| [Neon](https://neon.tech) | Yes, no card | Project dashboard → Connection string |
| [Supabase](https://supabase.com) | Yes, no card | Settings → Database → Session pooler |

Write the connection string out in full. `${VARS}` inside a `.env` file are
never expanded.

`npm run db:studio` opens a table browser at
[localhost:5555](http://localhost:5555) if you want to poke at the raw rows.

### Turning on extraction

Capturing a chat works with no API keys, but the messages just sit there as raw
text. To have them read into startups, deals, sources and interest signals, add
an [xAI](https://console.x.ai) key to `.env`:

```dotenv
XAI_API_KEY="xai-..."
```

Then hit **Re-read everything** on the overview page. That runs over messages
already stored, so it costs nothing extra to re-run after fixing a key.

## Getting a chat in

**X** goes through the [X Chat API](https://docs.x.com/xchat/introduction).
Connect your account in Settings, pick a chat on Home, and hit Refresh. The
whole history pages in — no browser tab, no scrolling, real message ids and
real timestamps.

Your chats are end-to-end encrypted, so X only ever hands over ciphertext. It
is decrypted on your machine with your account's own keys, which are unlocked
by the XChat PIN you set in the X app. The PIN is stored encrypted on this
box and is sent nowhere.

**WhatsApp** has no equivalent. Its Cloud API has a Groups product, but it
only serves groups a business number creates — there is no way to point it at
a group you are in. So WhatsApp history comes from WhatsApp's own export: open
the group, **⋮ → More → Export chat → Without media**, and load the `.txt` on
Home. Import a newer one later and only what is new is added.

The file has no timezone in it, so times are read as the zone of whichever
browser uploads it.

## Keys, and who pays

Every read costs somebody money: X bills per API call, and extraction bills
per token. There is no shared key and nothing to sign up for here — each
person runs their own instance against their own accounts, and puts their own
credentials in Settings:

| | What it is | Where |
| --- | --- | --- |
| **X app client id** | An app you create at developer.x.com, OAuth 2.0, callback `<your instance>/api/x/oauth/callback` | Settings → X |
| **XChat PIN** | The PIN you already set in the X app. Unlocks the keys that decrypt your chats | Settings → XChat PIN |
| **xAI key** | Extraction. Without it messages are stored but never interpreted | Settings → Model |

Both secrets are encrypted at rest with `CREDENTIALS_SECRET`, so a copy of the
database is not enough to use them.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Can't reach database server` | Postgres is not running. `npm run docker:up`, or check your hosted `DATABASE_URL`. |
| Refresh says to connect X | Settings → X. Save your app's client id, then connect. |
| Refresh says the PIN is not set | Settings → XChat PIN. Without it there is nothing to decrypt the chat with. |
| Some events could not be decrypted | Messages encrypted under a key version your account no longer holds, usually from before a key rotation. There is no way back into those. |
| Messages appear but no startups or deals | No model key. Settings → Model, then hit **Re-read everything**. |

| A **When** column is blank | X wrote a day separator in a form the parser does not know. The raw text is kept — `select distinct "sentAtLabel" from deal_room_message where "sentAt" is null;` shows it, and it belongs in an issue. |

## How it fits together

```
X Chat API  ──►  decrypt here  ──►  raw messages  ──►  extraction  ──►  members
(ciphertext)     (your keys)        in Postgres        (a model)        startups
                                                                        deals
WhatsApp export ──────────────────►                                     sources
(a .txt file)                                                           interest
```

Raw messages are always stored before anything is interpreted, so if the
extraction gets something wrong you can fix it and re-run without going back to
X at all.

## Layout

| Path | What lives there |
| --- | --- |
| `app/(app)/` | Home, and each chat's overview and four directories |
| `lib/dealflow/` | The X reader, ingest, extraction, the export parser, the read queries |
| `lib/credentials.ts` | Per-user API keys, encrypted at rest |
| `trpc/` | The typed API between browser and server |
| `prisma/` | Schema and migrations |

## Commands

| Command | Description |
| --- | --- |
| `npm run setup` | Bootstrap .env, database and migrations |
| `npm run dev` | Start the app |
| `npm run build` | Production build |
| `npm run db:studio` | Browse the database |
| `npm run db:migrate` | Apply migrations |
| `npm test` | Unit tests for the export parser |
| `npm run lint` | Biome lint and format check |
| `npm run typecheck` | TypeScript |
| `npm run docker:up` / `docker:down` | Start or stop Postgres |

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) covers running it and what to check before
a pull request. If a sync comes back empty or mis-attributed, X has probably
changed its markup — there is an issue template that collects the diagnostic.

Security and privacy notes are in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE). Use it for whatever you like.

Read chats you are a participant in. This reads what your own logged-in
browser can already see, and everything it captures lands in a database you
control — but that is a reason to be deliberate about whose messages you
store, not a reason to assume it is fine.
