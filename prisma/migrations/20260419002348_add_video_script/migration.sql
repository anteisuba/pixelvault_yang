-- CreateEnum
CREATE TYPE "VideoScriptStatus" AS ENUM ('DRAFT', 'SCRIPT_READY', 'FRAMES_READY', 'CLIPS_READY', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoScriptSceneStatus" AS ENUM ('PENDING', 'FRAME_GENERATING', 'FRAME_READY', 'CLIP_GENERATING', 'CLIP_READY', 'FAILED');

-- DropIndex
DROP INDEX "idx_character_card_name_trgm";

-- DropIndex
DROP INDEX "idx_generation_prompt_trgm";

-- CreateTable
CREATE TABLE "VideoScript" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "targetDuration" INTEGER NOT NULL,
    "totalScenes" INTEGER NOT NULL,
    "status" "VideoScriptStatus" NOT NULL DEFAULT 'DRAFT',
    "consistencyMode" TEXT NOT NULL,
    "characterCardId" TEXT,
    "styleCardId" TEXT,
    "videoModelId" TEXT NOT NULL,
    "finalVideoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoScriptScene" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "cameraShot" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dialogue" TEXT,
    "transition" TEXT NOT NULL,
    "frameGenerationId" TEXT,
    "clipGenerationId" TEXT,
    "status" "VideoScriptSceneStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoScriptScene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoScript_userId_createdAt_idx" ON "VideoScript"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VideoScript_userId_status_createdAt_idx" ON "VideoScript"("userId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VideoScriptScene_scriptId_orderIndex_idx" ON "VideoScriptScene"("scriptId", "orderIndex");

-- CreateIndex
CREATE INDEX "VideoScriptScene_status_createdAt_idx" ON "VideoScriptScene"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "VideoScriptScene_scriptId_orderIndex_key" ON "VideoScriptScene"("scriptId", "orderIndex");

-- AddForeignKey
ALTER TABLE "VideoScript" ADD CONSTRAINT "VideoScript_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoScriptScene" ADD CONSTRAINT "VideoScriptScene_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "VideoScript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
