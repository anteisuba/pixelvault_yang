-- 产物序号改真计数器（切片 N1）。
-- 第一步：加可空列。⛔ 不是 NOT NULL、⛔ 不带 unique —— 有存量行的表上，
-- 「非空且无默认」与「唯一」都可能在生产库直接失败并连带炸掉 Vercel 构建。
ALTER TABLE "Generation" ADD COLUMN "seq" INTEGER;

-- 取号与「我的第几件」都按 (userId, seq) 走。
CREATE INDEX "Generation_userId_seq_idx" ON "Generation"("userId", "seq");

-- 第二步：一次性数据回填。存量行按 (createdAt, id) 在每个 userId 内排出 1..N。
-- ⚠ 这是**数据迁移**，不是约束：失败不会留下半个约束，重跑也安全 ——
--    `WHERE g."seq" IS NULL` 让它幂等（已回填的行第二次跑一行都不动）。
-- ⚠ createdAt 同秒撞在一起时用 id 兜底定序，保证结果确定、可重放。
-- ⚠ userId 为空的匿名行不编号：没有「谁的第几件」这回事，它们的名字只带摘要。
UPDATE "Generation" AS g
SET "seq" = numbered."rn"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", "id") AS "rn"
  FROM "Generation"
  WHERE "userId" IS NOT NULL
) AS numbered
WHERE g."id" = numbered."id"
  AND g."seq" IS NULL;
