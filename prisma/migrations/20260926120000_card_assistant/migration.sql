-- AlterEnum
ALTER TYPE "AssistantSurface" ADD VALUE 'CARDS';

-- AlterTable
ALTER TABLE "AssistantPersona" ADD COLUMN     "characterCardId" TEXT;

-- AddForeignKey
ALTER TABLE "AssistantPersona" ADD CONSTRAINT "AssistantPersona_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
