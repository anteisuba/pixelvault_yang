-- 共享提示词搬到画廊：提示词页只留「我的模板」。

-- 从外部灵感复制来的模板，封面原本现查 InspirationPrompt；删表前把图存进模板自己。
UPDATE "Recipe" AS r
SET "coverImageUrl" = i."imageUrl"
FROM "InspirationPrompt" AS i
WHERE i."id" = r."userIntent"->>'inspirationId'
  AND r."userIntent"->>'source' = 'inspiration'
  AND r."coverImageUrl" IS NULL;

-- 模板不再「发布」：已公开的改回私有（visibility 列下次部署删）。
UPDATE "Recipe" SET "visibility" = 'PRIVATE' WHERE "visibility" = 'PUBLIC';

-- 外部抓取的灵感数据（owner 确认直接删，不备份）。
DROP TABLE "InspirationPrompt";
