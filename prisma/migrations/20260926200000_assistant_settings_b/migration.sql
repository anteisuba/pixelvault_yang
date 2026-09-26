-- 助手设置 B（owner 2026-09-26）：人设页的「用角色 / 头像单选 / 让助手记住」与
-- 记忆页的「你写的 / 助手记的」。
--
-- 全部是新列，要么可空、要么带默认值 —— 线上仍在跑的旧代码不读它们，照常工作；
-- 存量行一律拿默认值（avatarChoice 留 NULL，读的那一跳按老规矩回推）。
-- ⛔ 不进 prisma/migration-safety.test.ts 的 ACKNOWLEDGED：没有唯一索引 /
-- SET NOT NULL / 改列类型 / 非空无默认的新列。

-- CreateEnum
CREATE TYPE "AssistantMemorySource" AS ENUM ('ASSISTANT', 'CREATOR');

-- AlterTable
ALTER TABLE "AssistantPersona" ADD COLUMN     "avatarChoice" TEXT,
ADD COLUMN     "memoryCapture" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nameFromCharacter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "toneFromCharacter" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AssistantMemory" ADD COLUMN     "source" "AssistantMemorySource" NOT NULL DEFAULT 'ASSISTANT';
