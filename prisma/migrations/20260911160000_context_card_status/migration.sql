-- 助手 v2 §8.1 / §8.2 · 上下文卡加一列「待确认 / 已确认」
--
-- ⚠ 新列**非空但带默认**（`CONFIRMED`）：存量的每一行都是用户自己写下的卡，
-- 按 §8.2 一律视为已确认。所以这条迁移在有存量数据的库上也建得上，
-- ⛔ 不进 prisma/migration-safety.test.ts 的 ACKNOWLEDGED（那份登记簿只收
-- 「给已存在的表加约束」的迁移：唯一索引 / SET NOT NULL / 改列类型 /
-- 非空无默认的新列）。

-- CreateEnum
CREATE TYPE "ContextCardStatus" AS ENUM ('PROPOSED', 'CONFIRMED');

-- AlterTable
ALTER TABLE "ContextCard" ADD COLUMN     "status" "ContextCardStatus" NOT NULL DEFAULT 'CONFIRMED';

-- CreateIndex
CREATE INDEX "ContextCard_userId_status_updatedAt_idx" ON "ContextCard"("userId", "status", "updatedAt" DESC);
