-- 助手 v2 §8.3 / §11.3 · 用户偏好三列，接进系统提示的「关于这位创作者」那一段。
--
-- ⚠ 三列在有存量数据的库上都只可能成功：两个布尔**非空但带默认**，
-- 称呼那一列可空无默认。⛔ 不回填、⛔ 不加约束，所以这条迁移
-- ⛔ 不进 prisma/migration-safety.test.ts 的 ACKNOWLEDGED（那份登记簿只收
-- 唯一索引 / SET NOT NULL / 改列类型 / 非空无默认的新列）。
--
-- 默认值的含义：`nextStepHint` 关（助手本来就在说下一步，强制加一行会说两遍）；
-- `useMyWords` 开（用户的词就是这段对话的词表）；`addressUserAs` 为 NULL = 用账号名。

-- AlterTable
ALTER TABLE "AssistantPersona" ADD COLUMN     "nextStepHint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "useMyWords" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "addressUserAs" TEXT;
