# Contributing

## Running it

See [the README](./README.md). Short version: `npm run setup && npm run dev`,
then connect X in Settings.

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs against `test/mock-x.ts`, a stand-in for api.x.com, so the
reader's paging, attribution and ordering are all exercised without a live
account. Tests import server modules through `--conditions=react-server`,
which is what makes `server-only` resolve to a no-op outside Next.

One thing the tests deliberately do not cover: unlocking an account's XChat
keys. That needs Juicebox and a real PIN, and a test that faked it would be
testing the fake. `readXConversation` takes an `openChat` seam for exactly this
reason — everything around the decryption is testable, and the decryption
itself is honestly marked as the part that is not.

There are two sources, `lib/dealflow/x-chat.ts` (the X Chat API) and
`lib/dealflow/whatsapp-export.ts` (an exported file). They meet at `ingest()`
in `service.ts` and share nothing else. A third platform is a third file, not
a branch inside these two.

## The part that breaks

`extension/lib/x-context.ts` reads X's DOM. X changes that markup whenever it
likes, and when it does, syncing returns nothing or attributes messages to the
wrong person. That file is where to look, and the parser issue template
collects the diagnostic needed to fix it.

Raw messages are stored before anything is interpreted, so a parser fix is
always followed by "Re-read everything" rather than another scrape. Keep it
that way: never make correctness depend on re-reading X.

## Style

Biome decides formatting, so run `npm run lint:fix` rather than arguing with
it. Comments should explain why something is the way it is, especially where
the reason is a quirk of X's markup that the code alone cannot show.
