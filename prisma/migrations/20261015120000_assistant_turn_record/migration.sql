-- 助手每一轮的过程（owner 2026-10-15「建表」）—— 一张新表，供以后原样回放。
--
-- 没有一条语句碰既有表的列、约束或数据：唯一索引与外键都建在同一个文件里新建的
-- "AssistantTurnRecord" 上（User 那一侧只多一条反向关系，反向关系不落 SQL），所以它
-- ⛔ 不进 prisma/migration-safety.test.ts 的 ACKNOWLEDGED。
--
-- SQL 由 `prisma migrate diff`（从全部既有迁移重放进的内存 PGlite → schema.prisma）生成，
-- 再把全部迁移连同这一条重放进 PGlite，与 schema 对比为空。⚠ 没有对任何共用库执行。
--
-- ⚠ 三条索引各自答一个问题：
--  · (userId, turnId) UNIQUE        —— 同一轮的各跳写同一行，按人收窄；
--  · (userId, createdAt DESC)       —— 写时顺手删这个人 30 天前的、超出最近 200 条的；
--  · (createdAt)                    —— 每日 sweep 删全表过期的。

-- CreateTable
CREATE TABLE "AssistantTurnRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "hops" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "errorCode" TEXT,
    "workspaceKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "projectId" TEXT,
    "conversationId" TEXT,
    "adapterType" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "routeModel" TEXT,
    "apiKeyId" TEXT,
    "systemPromptHash" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "snapshot" JSONB,
    "transcript" JSONB NOT NULL,
    "snapshotBytes" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL,
    "truncated" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantTurnRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantTurnRecord_userId_createdAt_idx" ON "AssistantTurnRecord"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AssistantTurnRecord_createdAt_idx" ON "AssistantTurnRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantTurnRecord_userId_turnId_key" ON "AssistantTurnRecord"("userId", "turnId");

-- AddForeignKey
ALTER TABLE "AssistantTurnRecord" ADD CONSTRAINT "AssistantTurnRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
