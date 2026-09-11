-- 助手 v2 §9.3 · 项目规则加一列「哪一种」，来源白 / 黑名单复用这张表。
--
-- ⚠ 新列**非空但带默认**（`NOTE`）：存量的每一行都是普通项目规则，
-- 所以这条迁移在有存量数据的库上也建得上，⛔ 不回填、⛔ 不加约束，
-- 因此 ⛔ 不进 prisma/migration-safety.test.ts 的 ACKNOWLEDGED（那份登记簿只收
-- 唯一索引 / SET NOT NULL / 改列类型 / 非空无默认的新列）。

-- CreateEnum
CREATE TYPE "ProjectRuleKind" AS ENUM ('NOTE', 'SOURCE_ALLOW', 'SOURCE_DENY');

-- AlterTable
ALTER TABLE "ProjectRule" ADD COLUMN     "kind" "ProjectRuleKind" NOT NULL DEFAULT 'NOTE';

-- CreateIndex
CREATE INDEX "ProjectRule_userId_kind_idx" ON "ProjectRule"("userId", "kind");
