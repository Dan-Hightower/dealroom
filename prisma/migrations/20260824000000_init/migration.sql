-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DealFlowSourceType" AS ENUM ('syndicate', 'fund', 'spv', 'newsletter', 'scout', 'community', 'other');

-- CreateEnum
CREATE TYPE "DealRoomMessageKind" AS ENUM ('message', 'join', 'leave', 'system');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_room" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chatUrl" TEXT NOT NULL,
    "xConversationId" TEXT,
    "description" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastExtractedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_room_member" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "name" TEXT,
    "xHandle" TEXT,
    "profileUrl" TEXT,
    "bio" TEXT,
    "email" TEXT,
    "joinedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_room_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_room_message" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "memberId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "kind" "DealRoomMessageKind" NOT NULL DEFAULT 'message',
    "authorHandle" TEXT,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentAtLabel" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_room_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_startup" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "xHandle" TEXT,
    "website" TEXT,
    "description" TEXT,
    "sector" TEXT,
    "notes" TEXT,
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "firstMentionedAt" TIMESTAMP(3),
    "lastMentionedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_startup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "sharedById" TEXT,
    "sharedByHandle" TEXT,
    "sharedByName" TEXT,
    "blurb" TEXT,
    "terms" TEXT,
    "roundStage" TEXT,
    "url" TEXT,
    "sharedAt" TIMESTAMP(3),
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_flow_source" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DealFlowSourceType" NOT NULL DEFAULT 'other',
    "description" TEXT,
    "url" TEXT,
    "runById" TEXT,
    "runByHandle" TEXT,
    "runByName" TEXT,
    "sharedAt" TIMESTAMP(3),
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_flow_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_interest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "dealId" TEXT,
    "startupId" TEXT,
    "dealFlowSourceId" TEXT,
    "memberId" TEXT,
    "personName" TEXT,
    "personXHandle" TEXT,
    "personEmail" TEXT,
    "note" TEXT,
    "expressedAt" TIMESTAMP(3),
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_interest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "extension_session_tokenHash_key" ON "extension_session"("tokenHash");

-- CreateIndex
CREATE INDEX "extension_session_userId_idx" ON "extension_session"("userId");

-- CreateIndex
CREATE INDEX "deal_room_userId_idx" ON "deal_room"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "deal_room_userId_chatUrl_key" ON "deal_room"("userId", "chatUrl");

-- CreateIndex
CREATE INDEX "deal_room_member_roomId_joinedAt_idx" ON "deal_room_member"("roomId", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_room_member_roomId_identityKey_key" ON "deal_room_member"("roomId", "identityKey");

-- CreateIndex
CREATE INDEX "deal_room_message_roomId_sentAt_idx" ON "deal_room_message"("roomId", "sentAt");

-- CreateIndex
CREATE INDEX "deal_room_message_roomId_processedAt_idx" ON "deal_room_message"("roomId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_room_message_roomId_fingerprint_key" ON "deal_room_message"("roomId", "fingerprint");

-- CreateIndex
CREATE INDEX "deal_startup_roomId_lastMentionedAt_idx" ON "deal_startup"("roomId", "lastMentionedAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_startup_roomId_identityKey_key" ON "deal_startup"("roomId", "identityKey");

-- CreateIndex
CREATE INDEX "deal_roomId_sharedAt_idx" ON "deal"("roomId", "sharedAt");

-- CreateIndex
CREATE INDEX "deal_startupId_idx" ON "deal"("startupId");

-- CreateIndex
CREATE UNIQUE INDEX "deal_roomId_fingerprint_key" ON "deal"("roomId", "fingerprint");

-- CreateIndex
CREATE INDEX "deal_flow_source_roomId_sharedAt_idx" ON "deal_flow_source"("roomId", "sharedAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_flow_source_roomId_identityKey_key" ON "deal_flow_source"("roomId", "identityKey");

-- CreateIndex
CREATE INDEX "deal_interest_dealId_idx" ON "deal_interest"("dealId");

-- CreateIndex
CREATE INDEX "deal_interest_dealFlowSourceId_idx" ON "deal_interest"("dealFlowSourceId");

-- CreateIndex
CREATE INDEX "deal_interest_memberId_idx" ON "deal_interest"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "deal_interest_roomId_fingerprint_key" ON "deal_interest"("roomId", "fingerprint");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_session" ADD CONSTRAINT "extension_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_room" ADD CONSTRAINT "deal_room_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_room_member" ADD CONSTRAINT "deal_room_member_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "deal_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_room_message" ADD CONSTRAINT "deal_room_message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "deal_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_room_message" ADD CONSTRAINT "deal_room_message_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "deal_room_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_startup" ADD CONSTRAINT "deal_startup_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "deal_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "deal_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "deal_startup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "deal_room_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_flow_source" ADD CONSTRAINT "deal_flow_source_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "deal_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_flow_source" ADD CONSTRAINT "deal_flow_source_runById_fkey" FOREIGN KEY ("runById") REFERENCES "deal_room_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_interest" ADD CONSTRAINT "deal_interest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "deal_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_interest" ADD CONSTRAINT "deal_interest_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_interest" ADD CONSTRAINT "deal_interest_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "deal_startup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_interest" ADD CONSTRAINT "deal_interest_dealFlowSourceId_fkey" FOREIGN KEY ("dealFlowSourceId") REFERENCES "deal_flow_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_interest" ADD CONSTRAINT "deal_interest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "deal_room_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

