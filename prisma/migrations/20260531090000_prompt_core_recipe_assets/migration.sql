-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "coverGenerationId" TEXT,
ADD COLUMN "coverImageUrl" TEXT,
ADD COLUMN "favoriteCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "remixSourceRecipeId" TEXT,
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';

-- CreateIndex
CREATE INDEX "Recipe_visibility_isDeleted_createdAt_idx" ON "Recipe"("visibility", "isDeleted", "createdAt" DESC);
