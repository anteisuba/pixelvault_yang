-- AlterTable: 文本模型 chip 的持久化列（assistant-shell-v2 §4.5 / §7.4）。
-- 可空且无默认：NULL = 「自动」，与存量行（从没选过模型）的语义逐字一致，
-- ⛔ 不回填、⛔ 不加约束——有存量数据的库上这一条只可能成功。
ALTER TABLE "AssistantPersona" ADD COLUMN "routeModel" TEXT;
