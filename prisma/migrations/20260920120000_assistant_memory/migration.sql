-- 进度表 56a · 助手记忆（最简版）—— 一张新表 + 两个新枚举。
--
-- 没有一条语句碰既有表的数据或约束（只在 User 那一侧长出一条反向关系，
-- 而反向关系不落 SQL），所以它 ⛔ 不进 prisma/migration-safety.test.ts 的
-- ACKNOWLEDGED（那份登记簿只收唯一索引 / SET NOT NULL / 改列类型 /
-- 非空无默认的新列）。
--
-- ⚠ 三条索引各自答一个问题：
--  · (userId, scope, updatedAt DESC) —— 总览列表按域筛选后按时间倒序；
--  · (userId, updatedAt DESC)        —— 总览列表「全部」那一档；
--  · (userId, scope, lastUsedAt DESC) —— 注入取前 N 条、淘汰取最旧一条。

-- CreateEnum
CREATE TYPE "AssistantMemoryScope" AS ENUM ('IMAGE', 'VIDEO', 'CANVAS', 'LORA', 'GLOBAL');

-- CreateEnum
CREATE TYPE "AssistantMemoryKind" AS ENUM ('PREFERENCE', 'FACT', 'RULE');

-- CreateTable
CREATE TABLE "AssistantMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "AssistantMemoryScope" NOT NULL,
    "kind" "AssistantMemoryKind" NOT NULL,
    "text" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantMemory_userId_scope_updatedAt_idx" ON "AssistantMemory"("userId", "scope", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AssistantMemory_userId_updatedAt_idx" ON "AssistantMemory"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AssistantMemory_userId_scope_lastUsedAt_idx" ON "AssistantMemory"("userId", "scope", "lastUsedAt" DESC);

-- AddForeignKey
ALTER TABLE "AssistantMemory" ADD CONSTRAINT "AssistantMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
