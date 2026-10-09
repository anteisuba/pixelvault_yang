-- 记忆按项目分（助手 v3 S4，owner 2026-10-09：一个项目一份记忆，换了项目之前的记忆
-- 不能影响新项目；账户级的习惯照旧全局）。
--
-- 纯新增一列可空的 projectId + 一条索引 + 外键（项目被真删时它的记忆跟着删）。
-- 已有的画布记忆按当初记下它的会话归回那个项目：只动助手记的（source = ASSISTANT）、
-- 画布范围的、会话上记着项目且项目还在的那几条；2026-10-09 盘点时全库只有 1 条
-- （「女德拉科头发锁定为大偏分」→ 马尔福）。你自己写的与全局 / 别的工作台的一条不动。
--
-- 回滚：DROP 这一列（连带索引与外键）即回到迁移前，正在跑的旧版本不读这一列。

-- AlterTable
ALTER TABLE "AssistantMemory" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "AssistantMemory_userId_projectId_lastUsedAt_idx" ON "AssistantMemory"("userId", "projectId", "lastUsedAt" DESC);

-- AddForeignKey
ALTER TABLE "AssistantMemory" ADD CONSTRAINT "AssistantMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "NodeWorkflowProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill
UPDATE "AssistantMemory" AS m
SET "projectId" = c."projectId"
FROM "AssistantConversation" AS c
WHERE m."conversationId" = c."id"
  AND m."scope" = 'CANVAS'
  AND m."source" = 'ASSISTANT'
  AND c."projectId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "NodeWorkflowProject" AS p WHERE p."id" = c."projectId");
