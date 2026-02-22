-- CreateTable
CREATE TABLE "Auction" (
    "id" SERIAL NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "offeredUserCardId" INTEGER NOT NULL,
    "wantedCardId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedById" INTEGER,
    "completedUserCardId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_offeredUserCardId_key" ON "Auction"("offeredUserCardId");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_completedUserCardId_key" ON "Auction"("completedUserCardId");

-- CreateIndex
CREATE INDEX "Auction_creatorId_idx" ON "Auction"("creatorId");

-- CreateIndex
CREATE INDEX "Auction_status_idx" ON "Auction"("status");

-- CreateIndex
CREATE INDEX "Auction_wantedCardId_idx" ON "Auction"("wantedCardId");

-- CreateIndex
CREATE INDEX "Auction_expiresAt_idx" ON "Auction"("expiresAt");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_offeredUserCardId_fkey" FOREIGN KEY ("offeredUserCardId") REFERENCES "UserCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_wantedCardId_fkey" FOREIGN KEY ("wantedCardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_completedUserCardId_fkey" FOREIGN KEY ("completedUserCardId") REFERENCES "UserCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
