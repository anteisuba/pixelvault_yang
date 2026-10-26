-- CreateEnum
CREATE TYPE "CharacterRevisionSource" AS ENUM ('CHAT', 'REFLECTION');

-- CreateTable
CREATE TABLE "CharacterCardRevision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "source" "CharacterRevisionSource" NOT NULL,
    "fields" TEXT[],
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "revertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterCardRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterCardRevision_userId_createdAt_idx" ON "CharacterCardRevision"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CharacterCardRevision_characterCardId_createdAt_idx" ON "CharacterCardRevision"("characterCardId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "CharacterCardRevision" ADD CONSTRAINT "CharacterCardRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCardRevision" ADD CONSTRAINT "CharacterCardRevision_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

