-- A chat imported from an exported file has no live URL to open.
-- Postgres counts NULLs as distinct, so the unique index still allows many.
ALTER TABLE "deal_room" ALTER COLUMN "chatUrl" DROP NOT NULL;
