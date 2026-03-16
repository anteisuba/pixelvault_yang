-- CreateEnum
CREATE TYPE "GenerationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Generation" RENAME COLUMN "creditsCost" TO "requestCount";
UPDATE "Generation" SET "requestCount" = 1;
ALTER TABLE "Generation" ALTER COLUMN "requestCount" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "credits";

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationId" TEXT,
    "adapterType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" "GenerationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationId" TEXT,
    "generationJobId" TEXT,
    "adapterType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "inputImageCount" INTEGER NOT NULL DEFAULT 0,
    "outputImageCount" INTEGER NOT NULL DEFAULT 1,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_generationId_key" ON "GenerationJob"("generationId");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_createdAt_idx" ON "GenerationJob"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GenerationJob_status_createdAt_idx" ON "GenerationJob"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApiUsageLedger_userId_createdAt_idx" ON "ApiUsageLedger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApiUsageLedger_adapterType_modelId_createdAt_idx" ON "ApiUsageLedger"("adapterType", "modelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApiUsageLedger_wasSuccessful_createdAt_idx" ON "ApiUsageLedger"("wasSuccessful", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageLedger" ADD CONSTRAINT "ApiUsageLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageLedger" ADD CONSTRAINT "ApiUsageLedger_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageLedger" ADD CONSTRAINT "ApiUsageLedger_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
