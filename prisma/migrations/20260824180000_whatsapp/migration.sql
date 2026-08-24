-- Chats can now live somewhere other than X.
--
-- The three renamed columns hold the same values they always did; a generated
-- migration would drop and re-add them, which throws away every handle already
-- captured. Renaming keeps the data.

CREATE TYPE "ChatPlatform" AS ENUM ('x', 'whatsapp');

ALTER TABLE "deal_room" ADD COLUMN "platform" "ChatPlatform" NOT NULL DEFAULT 'x';
ALTER TABLE "deal_room" RENAME COLUMN "xConversationId" TO "conversationId";

ALTER TABLE "deal_room_member" RENAME COLUMN "xHandle" TO "handle";

ALTER TABLE "deal_interest" RENAME COLUMN "personXHandle" TO "personHandle";
