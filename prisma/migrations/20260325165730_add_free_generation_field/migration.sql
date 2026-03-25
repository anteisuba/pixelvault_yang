-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "isFreeGeneration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPromptPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenceImageUrl" TEXT,
ALTER COLUMN "isPublic" SET DEFAULT false;

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "externalRequestId" TEXT,
ADD COLUMN     "prompt" TEXT;

-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "externalModelId" TEXT NOT NULL,
    "adapterType" TEXT NOT NULL,
    "outputType" "OutputType" NOT NULL DEFAULT 'IMAGE',
    "cost" INTEGER NOT NULL DEFAULT 1,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "officialUrl" TEXT,
    "timeoutMs" INTEGER,
    "qualityTier" TEXT,
    "i2vModelId" TEXT,
    "videoDefaults" JSONB,
    "providerConfig" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "healthStatus" TEXT,
    "lastHealthCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelConfig_modelId_key" ON "ModelConfig"("modelId");

-- CreateIndex
CREATE INDEX "ModelConfig_outputType_available_sortOrder_idx" ON "ModelConfig"("outputType", "available", "sortOrder");

-- CreateIndex
CREATE INDEX "Generation_userId_isFreeGeneration_createdAt_idx" ON "Generation"("userId", "isFreeGeneration", "createdAt" DESC);
