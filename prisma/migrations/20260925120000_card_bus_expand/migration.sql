-- AlterTable
ALTER TABLE "CharacterCard" ADD COLUMN     "extensions" JSONB,
ADD COLUMN     "handle" TEXT,
ADD COLUMN     "referenceSlots" JSONB,
ADD COLUMN     "summary" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CharacterCard_userId_handle_key" ON "CharacterCard"("userId", "handle");

