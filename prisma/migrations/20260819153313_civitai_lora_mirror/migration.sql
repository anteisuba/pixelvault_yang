-- CreateTable
CREATE TABLE "CivitaiLoraMirror" (
    "modelId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "versionName" TEXT,
    "name" TEXT NOT NULL,
    "creator" TEXT,
    "category" TEXT,
    "nsfwLevelMax" INTEGER NOT NULL DEFAULT 0,
    "nsfwNamed" BOOLEAN NOT NULL DEFAULT false,
    "baseModel" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trainedWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashAutoV3" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "thumbsUpCount" INTEGER NOT NULL DEFAULT 0,
    "collectedCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "images" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lastVersionAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CivitaiLoraMirror_pkey" PRIMARY KEY ("modelId")
);

-- CreateTable
CREATE TABLE "CivitaiMirrorSyncState" (
    "id" TEXT NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "passStartedAt" TIMESTAMP(3),
    "lastCompletedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CivitaiMirrorSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CivitaiLoraMirror_downloadCount_idx" ON "CivitaiLoraMirror"("downloadCount" DESC);

-- CreateIndex
CREATE INDEX "CivitaiLoraMirror_lastVersionAt_idx" ON "CivitaiLoraMirror"("lastVersionAt");

-- CreateIndex
CREATE INDEX "CivitaiLoraMirror_baseModel_idx" ON "CivitaiLoraMirror"("baseModel");

-- CreateIndex
CREATE INDEX "CivitaiLoraMirror_nsfwLevelMax_idx" ON "CivitaiLoraMirror"("nsfwLevelMax");

-- CreateIndex
CREATE INDEX "CivitaiLoraMirror_name_idx" ON "CivitaiLoraMirror" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CivitaiLoraMirror_tags_idx" ON "CivitaiLoraMirror" USING GIN ("tags");
