-- CreateEnum
CREATE TYPE "ExecutionOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ExecutionOutbox" (
    "id" TEXT NOT NULL,
    "generationJobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "ExecutionOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionOutbox_generationJobId_key" ON "ExecutionOutbox"("generationJobId");

-- CreateIndex
CREATE INDEX "ExecutionOutbox_status_leaseExpiresAt_createdAt_idx" ON "ExecutionOutbox"("status", "leaseExpiresAt", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ExecutionOutbox" ADD CONSTRAINT "ExecutionOutbox_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
