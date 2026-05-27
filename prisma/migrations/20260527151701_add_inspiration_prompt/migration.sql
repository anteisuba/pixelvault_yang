-- CreateTable
CREATE TABLE "InspirationPrompt" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'meigen',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT NOT NULL,
    "modelHint" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceUrl" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspirationPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspirationPrompt_isPublic_rank_idx" ON "InspirationPrompt"("isPublic", "rank");

-- CreateIndex
CREATE INDEX "InspirationPrompt_source_idx" ON "InspirationPrompt"("source");
