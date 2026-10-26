-- CreateTable
CREATE TABLE "CharacterJournal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterJournal_userId_createdAt_idx" ON "CharacterJournal"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CharacterJournal_characterCardId_createdAt_idx" ON "CharacterJournal"("characterCardId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "CharacterJournal" ADD CONSTRAINT "CharacterJournal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterJournal" ADD CONSTRAINT "CharacterJournal_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

