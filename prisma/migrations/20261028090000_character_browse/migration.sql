-- AlterTable
ALTER TABLE "CharacterCard" ADD COLUMN     "browseDailyLimit" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "browseEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "browsedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CharacterFinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterSticker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "whenToUse" TEXT NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterSticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterFinding_characterCardId_seenAt_idx" ON "CharacterFinding"("characterCardId", "seenAt" DESC);

-- CreateIndex
CREATE INDEX "CharacterFinding_userId_seenAt_idx" ON "CharacterFinding"("userId", "seenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterFinding_characterCardId_url_key" ON "CharacterFinding"("characterCardId", "url");

-- CreateIndex
CREATE INDEX "CharacterSticker_characterCardId_isBlocked_createdAt_idx" ON "CharacterSticker"("characterCardId", "isBlocked", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CharacterSticker_userId_idx" ON "CharacterSticker"("userId");

-- AddForeignKey
ALTER TABLE "CharacterFinding" ADD CONSTRAINT "CharacterFinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFinding" ADD CONSTRAINT "CharacterFinding_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSticker" ADD CONSTRAINT "CharacterSticker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSticker" ADD CONSTRAINT "CharacterSticker_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

