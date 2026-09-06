-- 统一助手改版第一期 · 助手设置（persona）与项目规则
-- docs/references/pages/assistant-shell.md §8.4（AssistantPersona）· §10（ProjectRule）
--
-- 两张**新表**，一个新枚举。没有一条语句碰既有表的数据或约束，所以它不进
-- prisma/migration-safety.test.ts 的 ACKNOWLEDGED（那份登记簿只收「给已存在的表
-- 加约束」的迁移）。

-- CreateEnum
CREATE TYPE "ProjectRuleSource" AS ENUM ('ASSISTANT', 'CREATOR');

-- CreateTable
CREATE TABLE "AssistantPersona" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "avatarPreset" TEXT,
    "avatarUrl" TEXT,
    "avatarStorageKey" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "toneCustom" TEXT,
    "verbosity" TEXT NOT NULL DEFAULT 'standard',
    "planMode" TEXT NOT NULL DEFAULT 'auto',
    "language" TEXT NOT NULL DEFAULT 'ui',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT,
    "text" TEXT NOT NULL,
    "source" "ProjectRuleSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantPersona_userId_key" ON "AssistantPersona"("userId");

-- CreateIndex
CREATE INDEX "ProjectRule_userId_createdAt_idx" ON "ProjectRule"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AssistantPersona" ADD CONSTRAINT "AssistantPersona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRule" ADD CONSTRAINT "ProjectRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
