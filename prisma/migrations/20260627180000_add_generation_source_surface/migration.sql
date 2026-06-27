-- CreateEnum
CREATE TYPE "GenerationSourceSurface" AS ENUM ('IMAGE_STUDIO', 'LORA_WORKBENCH', 'CANVAS', 'EDIT');

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN "loraLineage" JSONB,
ADD COLUMN "sourceSurface" "GenerationSourceSurface" NOT NULL DEFAULT 'IMAGE_STUDIO';

-- CreateIndex
CREATE INDEX "Generation_userId_sourceSurface_createdAt_idx" ON "Generation"("userId", "sourceSurface", "createdAt" DESC);
