-- Baseline migration: align migration history with production DB schema
-- Production was diverged via prior 'prisma db push' runs; this migration
-- captures all missing tables/enums/columns/indexes/FKs so shadow DB replays match production.
-- On production: marked as APPLIED via 'prisma migrate resolve --applied' (does not run).

-- ─── Enums ──────────────────────────────────────────────────
CREATE TYPE "CharacterCardStatus" AS ENUM ('DRAFT', 'REFINING', 'STABLE', 'ARCHIVED');
CREATE TYPE "LoraTrainingStatus" AS ENUM ('QUEUED', 'TRAINING', 'COMPLETED', 'FAILED', 'CANCELED');
CREATE TYPE "PipelineClipStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "VideoPipelineStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- ─── Missing Tables ─────────────────────────────────────────
CREATE TABLE "BackgroundCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceImageUrl" TEXT,
    "sourceStorageKey" TEXT,
    "backgroundPrompt" TEXT NOT NULL,
    "attributes" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "loras" JSONB,

    CONSTRAINT "BackgroundCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardRecipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "characterCardId" TEXT,
    "backgroundCardId" TEXT,
    "styleCardId" TEXT,
    "freePrompt" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardRecipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceImageUrl" TEXT NOT NULL,
    "sourceStorageKey" TEXT NOT NULL,
    "characterPrompt" TEXT NOT NULL,
    "modelPrompts" JSONB,
    "referenceImages" JSONB,
    "attributes" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CharacterCardStatus" NOT NULL DEFAULT 'DRAFT',
    "stabilityScore" DOUBLE PRECISION,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceImages" JSONB,
    "parentId" TEXT,
    "sourceImageEntries" JSONB,
    "variantLabel" TEXT,
    "projectId" TEXT,
    "loras" JSONB,

    CONSTRAINT "CharacterCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationCharacterCard" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationCharacterCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoraTrainingJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerWord" TEXT NOT NULL,
    "loraType" TEXT NOT NULL DEFAULT 'subject',
    "baseModel" TEXT NOT NULL DEFAULT 'flux-dev',
    "trainingImageKeys" TEXT[],
    "status" "LoraTrainingStatus" NOT NULL DEFAULT 'QUEUED',
    "externalTrainingId" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "loraUrl" TEXT,
    "loraStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "characterCardId" TEXT,

    CONSTRAINT "LoraTrainingJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StyleCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceImageUrl" TEXT,
    "sourceStorageKey" TEXT,
    "stylePrompt" TEXT NOT NULL,
    "attributes" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "loras" JSONB,

    CONSTRAINT "StyleCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoPipeline" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "VideoPipelineStatus" NOT NULL DEFAULT 'RUNNING',
    "prompt" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "adapterType" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "resolution" TEXT,
    "negativePrompt" TEXT,
    "extensionMethod" TEXT NOT NULL DEFAULT 'native_extend',
    "targetDurationSec" INTEGER NOT NULL,
    "currentDurationSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalClips" INTEGER NOT NULL DEFAULT 1,
    "completedClips" INTEGER NOT NULL DEFAULT 0,
    "finalVideoUrl" TEXT,
    "finalStorageKey" TEXT,
    "generationId" TEXT,
    "characterCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referenceImageUrl" TEXT,
    "apiKeyId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoPipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoPipelineClip" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "clipIndex" INTEGER NOT NULL,
    "status" "PipelineClipStatus" NOT NULL DEFAULT 'PENDING',
    "generationJobId" TEXT,
    "externalRequestId" TEXT,
    "videoUrl" TEXT,
    "storageKey" TEXT,
    "lastFrameUrl" TEXT,
    "durationSec" DOUBLE PRECISION,
    "inputVideoUrl" TEXT,
    "inputFrameUrl" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoPipelineClip_pkey" PRIMARY KEY ("id")
);


-- ─── Missing columns on existing tables ─────────────────────
ALTER TABLE "ArenaMatch" ADD COLUMN "referenceImage" TEXT;

ALTER TABLE "User"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "avatarStorageKey" TEXT,
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "bannerStorageKey" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Generation"
  ADD COLUMN "characterCardId" TEXT,
  ADD COLUMN "cardRecipeId" TEXT,
  ADD COLUMN "recipeSnapshot" JSONB,
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- ─── Missing indexes ────────────────────────────────────────
CREATE INDEX "BackgroundCard_userId_projectId_isDeleted_updatedAt_idx" ON "BackgroundCard"("userId" ASC, "projectId" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE INDEX "CardRecipe_userId_projectId_isDeleted_updatedAt_idx" ON "CardRecipe"("userId" ASC, "projectId" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE INDEX "CharacterCard_parentId_isDeleted_updatedAt_idx" ON "CharacterCard"("parentId" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE INDEX "CharacterCard_userId_isDeleted_updatedAt_idx" ON "CharacterCard"("userId" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE INDEX "CharacterCard_userId_projectId_isDeleted_updatedAt_idx" ON "CharacterCard"("userId" ASC, "projectId" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE INDEX "CharacterCard_userId_status_isDeleted_idx" ON "CharacterCard"("userId" ASC, "status" ASC, "isDeleted" ASC);
CREATE INDEX "Collection_isPublic_isDeleted_updatedAt_idx" ON "Collection"("isPublic" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE INDEX "Collection_userId_isDeleted_updatedAt_idx" ON "Collection"("userId" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE UNIQUE INDEX "CollectionItem_collectionId_generationId_key" ON "CollectionItem"("collectionId" ASC, "generationId" ASC);
CREATE INDEX "CollectionItem_collectionId_orderIndex_idx" ON "CollectionItem"("collectionId" ASC, "orderIndex" ASC);
CREATE INDEX "CollectionItem_generationId_idx" ON "CollectionItem"("generationId" ASC);
CREATE INDEX "GenerationCharacterCard_characterCardId_createdAt_idx" ON "GenerationCharacterCard"("characterCardId" ASC, "createdAt" DESC);
CREATE UNIQUE INDEX "GenerationCharacterCard_generationId_characterCardId_key" ON "GenerationCharacterCard"("generationId" ASC, "characterCardId" ASC);
CREATE INDEX "GenerationCharacterCard_generationId_idx" ON "GenerationCharacterCard"("generationId" ASC);
CREATE INDEX "LoraTrainingJob_userId_status_createdAt_idx" ON "LoraTrainingJob"("userId" ASC, "status" ASC, "createdAt" DESC);
CREATE INDEX "StyleCard_userId_projectId_isDeleted_updatedAt_idx" ON "StyleCard"("userId" ASC, "projectId" ASC, "isDeleted" ASC, "updatedAt" DESC);
CREATE INDEX "UserFollow_followerId_createdAt_idx" ON "UserFollow"("followerId" ASC, "createdAt" DESC);
CREATE UNIQUE INDEX "UserFollow_followerId_followingId_key" ON "UserFollow"("followerId" ASC, "followingId" ASC);
CREATE INDEX "UserFollow_followingId_idx" ON "UserFollow"("followingId" ASC);
CREATE INDEX "UserLike_generationId_idx" ON "UserLike"("generationId" ASC);
CREATE INDEX "UserLike_userId_createdAt_idx" ON "UserLike"("userId" ASC, "createdAt" DESC);
CREATE UNIQUE INDEX "UserLike_userId_generationId_key" ON "UserLike"("userId" ASC, "generationId" ASC);
CREATE UNIQUE INDEX "VideoPipeline_generationId_key" ON "VideoPipeline"("generationId" ASC);
CREATE INDEX "VideoPipeline_status_createdAt_idx" ON "VideoPipeline"("status" ASC, "createdAt" DESC);
CREATE INDEX "VideoPipeline_userId_createdAt_idx" ON "VideoPipeline"("userId" ASC, "createdAt" DESC);
CREATE INDEX "VideoPipelineClip_pipelineId_clipIndex_idx" ON "VideoPipelineClip"("pipelineId" ASC, "clipIndex" ASC);
CREATE UNIQUE INDEX "VideoPipelineClip_pipelineId_clipIndex_key" ON "VideoPipelineClip"("pipelineId" ASC, "clipIndex" ASC);
CREATE INDEX "VideoPipelineClip_status_createdAt_idx" ON "VideoPipelineClip"("status" ASC, "createdAt" DESC);
CREATE INDEX "Generation_characterCardId_createdAt_idx" ON "Generation"("characterCardId" ASC, "createdAt" DESC);
CREATE INDEX "Generation_userId_isFeatured_isPublic_createdAt_idx" ON "Generation"("userId" ASC, "isFeatured" ASC, "isPublic" ASC, "createdAt" DESC);
CREATE INDEX "Generation_userId_isPublic_createdAt_idx" ON "Generation"("userId" ASC, "isPublic" ASC, "createdAt" DESC);
CREATE INDEX "User_username_idx" ON "User"("username" ASC);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username" ASC);
CREATE INDEX "Story_userId_isPublic_createdAt_idx" ON "Story"("userId" ASC, "isPublic" ASC, "createdAt" DESC);
CREATE UNIQUE INDEX "UserApiKey_userId_adapterType_modelId_key" ON "UserApiKey"("userId" ASC, "adapterType" ASC, "modelId" ASC);

-- ─── Foreign keys ───────────────────────────────────────────
ALTER TABLE "BackgroundCard" ADD CONSTRAINT "BackgroundCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackgroundCard" ADD CONSTRAINT "BackgroundCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardRecipe" ADD CONSTRAINT "CardRecipe_backgroundCardId_fkey" FOREIGN KEY ("backgroundCardId") REFERENCES "BackgroundCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardRecipe" ADD CONSTRAINT "CardRecipe_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardRecipe" ADD CONSTRAINT "CardRecipe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardRecipe" ADD CONSTRAINT "CardRecipe_styleCardId_fkey" FOREIGN KEY ("styleCardId") REFERENCES "StyleCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardRecipe" ADD CONSTRAINT "CardRecipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterCard" ADD CONSTRAINT "CharacterCard_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterCard" ADD CONSTRAINT "CharacterCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CharacterCard" ADD CONSTRAINT "CharacterCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationCharacterCard" ADD CONSTRAINT "GenerationCharacterCard_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationCharacterCard" ADD CONSTRAINT "GenerationCharacterCard_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoraTrainingJob" ADD CONSTRAINT "LoraTrainingJob_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoraTrainingJob" ADD CONSTRAINT "LoraTrainingJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLike" ADD CONSTRAINT "UserLike_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLike" ADD CONSTRAINT "UserLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoPipeline" ADD CONSTRAINT "VideoPipeline_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VideoPipeline" ADD CONSTRAINT "VideoPipeline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoPipelineClip" ADD CONSTRAINT "VideoPipelineClip_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "VideoPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_cardRecipeId_fkey" FOREIGN KEY ("cardRecipeId") REFERENCES "CardRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
