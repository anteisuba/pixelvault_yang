-- 按账号排队（出图）：同一账号同时只出几张，其余排队。两列都可空，旧任务不受影响。
ALTER TABLE "GenerationJob" ADD COLUMN "slotKey" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "slotAcquiredAt" TIMESTAMP(3);

CREATE INDEX "GenerationJob_slotKey_status_idx" ON "GenerationJob"("slotKey", "status");
