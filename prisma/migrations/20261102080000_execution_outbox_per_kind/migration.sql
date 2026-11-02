-- o-worker outbox（11-02）：一个任务从「最多一条 outbox」改成「每种 kind 最多一条」，
-- 让派发 outbox（WORKER_DISPATCH）和出图后的预览图 outbox 能挂在同一个任务上。
-- 存量行 generationJobId 本来就唯一，(generationJobId, kind) 必然唯一，新索引一定建得上。
DROP INDEX "ExecutionOutbox_generationJobId_key";

CREATE UNIQUE INDEX "ExecutionOutbox_generationJobId_kind_key" ON "ExecutionOutbox"("generationJobId", "kind");

-- 补发扫描按 kind + status + updatedAt 找待补发的派发行。
CREATE INDEX "ExecutionOutbox_kind_status_updatedAt_idx" ON "ExecutionOutbox"("kind", "status", "updatedAt");
