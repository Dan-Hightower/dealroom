-- CreateTable
CREATE TABLE "startup_holding" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "note" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_holding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "startup_holding_startupId_idx" ON "startup_holding"("startupId");

-- CreateIndex
CREATE INDEX "startup_holding_memberId_idx" ON "startup_holding"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "startup_holding_roomId_fingerprint_key" ON "startup_holding"("roomId", "fingerprint");

-- AddForeignKey
ALTER TABLE "startup_holding" ADD CONSTRAINT "startup_holding_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "deal_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startup_holding" ADD CONSTRAINT "startup_holding_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "deal_startup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startup_holding" ADD CONSTRAINT "startup_holding_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "deal_room_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

