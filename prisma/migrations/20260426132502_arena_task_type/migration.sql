-- AlterTable
ALTER TABLE "ArenaMatch" ADD COLUMN     "taskType" TEXT;

-- CreateIndex
CREATE INDEX "ArenaMatch_taskType_idx" ON "ArenaMatch"("taskType");
