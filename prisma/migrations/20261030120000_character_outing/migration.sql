-- CreateTable
CREATE TABLE "CharacterOuting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "sources" TEXT[],
    "sites" TEXT[],
    "budgetPoints" INTEGER NOT NULL,
    "usedTokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "kept" INTEGER NOT NULL DEFAULT 0,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "emptyRounds" INTEGER NOT NULL DEFAULT 0,
    "nowLabel" TEXT,
    "endReason" TEXT,
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CharacterOuting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterOuting_characterCardId_startedAt_idx" ON "CharacterOuting"("characterCardId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "CharacterOuting_userId_startedAt_idx" ON "CharacterOuting"("userId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "CharacterOuting" ADD CONSTRAINT "CharacterOuting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterOuting" ADD CONSTRAINT "CharacterOuting_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CharacterSticker" ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE INDEX "CharacterSticker_characterCardId_contentHash_idx" ON "CharacterSticker"("characterCardId", "contentHash");
