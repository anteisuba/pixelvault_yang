-- CreateTable
CREATE TABLE "ImageAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceImageUrl" TEXT NOT NULL,
    "sourceStorageKey" TEXT NOT NULL,
    "generatedPrompt" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "winnerId" TEXT,
    "votedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaEntry" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "wasVoted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ArenaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelEloRating" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelEloRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverImageId" TEXT,
    "displayMode" TEXT NOT NULL DEFAULT 'scroll',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPanel" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "generationId" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "caption" TEXT,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryPanel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageAnalysis_userId_createdAt_idx" ON "ImageAnalysis"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ArenaMatch_userId_createdAt_idx" ON "ArenaMatch"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ArenaEntry_matchId_generationId_key" ON "ArenaEntry"("matchId", "generationId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelEloRating_modelId_key" ON "ModelEloRating"("modelId");

-- CreateIndex
CREATE INDEX "Story_userId_createdAt_idx" ON "Story"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Story_isPublic_createdAt_idx" ON "Story"("isPublic", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StoryPanel_storyId_orderIndex_idx" ON "StoryPanel"("storyId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPanel_storyId_orderIndex_key" ON "StoryPanel"("storyId", "orderIndex");

-- AddForeignKey
ALTER TABLE "ImageAnalysis" ADD CONSTRAINT "ImageAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaMatch" ADD CONSTRAINT "ArenaMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaEntry" ADD CONSTRAINT "ArenaEntry_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "ArenaMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaEntry" ADD CONSTRAINT "ArenaEntry_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPanel" ADD CONSTRAINT "StoryPanel_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPanel" ADD CONSTRAINT "StoryPanel_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
