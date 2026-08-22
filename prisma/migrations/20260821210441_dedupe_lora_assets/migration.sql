-- 在建唯一索引之前，先把同一个人重复收藏的同一个 LoRA 收敛成一行。
--
-- ⚠ 时间戳故意比 20260821210442_lora_unique_user_url 早一秒：Prisma 按目录名
--   排序执行，这条必须跑在唯一索引前面，否则索引会因存量重复而失败。
--   （代价：本地库已经应用过 210442，这条会乱序落地。`migrate deploy` 不受
--   影响；本地跑 `prisma migrate dev` 会提示 applied out of order。）
--
-- 为什么需要它：210442 那条提交清的是**本地库**。2026-08-22 查生产（103 行）
-- 仍有 2 组重复，分别相差 5ms 与 184ms，四行全部 usageCount=0 / lastUsedAt=null
-- / isPublic=false / trainingJobId=null —— 都是双击，没有任何东西引用它们。
-- ⚠ CI 的「从零重建数据库」跑不出这个问题：空库没有存量数据，唯一索引永远建
--   得上。只有真实数据能暴露它。
--
-- 保留规则（严格全序，每组恰好活一行）：usageCount 大者胜 → 同则 createdAt
-- 早者胜 → 同则 id 小者胜。
-- ⚠ 把 usageCount 放在 createdAt 前面不是为了这次的数据（四行全是 0，规则退化
--   成「保留最早」，与 210442 提交里的做法一致），是为了这段 SQL 被重放到任何
--   别的库时不会删掉那一条真正被用过的行 —— styleCode 是 unique 且进了 ?style=
--   分享链接，删错行会静默断掉别人的链接。
--
-- userId IS NULL 的 curated 平台 LoRA 不参与：它们无主，唯一索引对 NULL 也不
-- 去重，语义上本就允许多行。

DELETE FROM "LoraAsset" a
USING "LoraAsset" b
WHERE a."userId" IS NOT NULL
  AND a."userId" = b."userId"
  AND a."loraUrl" = b."loraUrl"
  AND (
    b."usageCount" > a."usageCount"
    OR (b."usageCount" = a."usageCount" AND b."createdAt" < a."createdAt")
    OR (
      b."usageCount" = a."usageCount"
      AND b."createdAt" = a."createdAt"
      AND b."id" < a."id"
    )
  );
