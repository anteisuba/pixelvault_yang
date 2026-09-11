-- AlterTable: 每轮结账的结论记录（assistant-shell-v2 §7.2 / §7.4）。
-- 非空但**带默认值**：存量行由 Postgres 自己填 '[]'，与「这条会话还没有任何
-- 结账记录」的语义逐字一致，⛔ 不回填、⛔ 不加约束——有存量数据的库上这一条
-- 只可能成功（判据见 prisma/migration-safety.test.ts 的 findConstraintsOnExistingTables）。
ALTER TABLE "AssistantConversation" ADD COLUMN "rounds" JSONB NOT NULL DEFAULT '[]';
