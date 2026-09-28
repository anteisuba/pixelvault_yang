-- 素材文件夹 B（2026-09-28）：一张图可以同时在好几个夹里 + 文件夹手动排序 / 置顶。
-- ⚠ 只加不删：`Generation.projectId` 这一次不动（代码已不再读写它），
--    上线稳定后由单独一条迁移删掉 —— 同一次删会让构建跑迁移那几分钟里线上旧代码查素材全报错。

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "pinnedOrder" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProjectItem" (
    "projectId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectItem_pkey" PRIMARY KEY ("projectId","generationId")
);

-- CreateIndex
CREATE INDEX "ProjectItem_generationId_idx" ON "ProjectItem"("generationId");

-- AddForeignKey
ALTER TABLE "ProjectItem" ADD CONSTRAINT "ProjectItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectItem" ADD CONSTRAINT "ProjectItem_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 回填一：每张图现在所在的那个夹搬进归属表；加入时间取图的生成时间。
-- ⚠ 只搬还活着的夹（软删的夹里本不该有图 —— 删夹时同一事务已把图挪出）。
-- ⚠ 可重跑：主键 (projectId, generationId) + ON CONFLICT DO NOTHING。
INSERT INTO "ProjectItem" ("projectId", "generationId", "addedAt")
SELECT g."projectId", g."id", g."createdAt"
FROM "Generation" AS g
JOIN "Project" AS p ON p."id" = g."projectId"
WHERE p."isDeleted" = false
  AND p."userId" = g."userId"
ON CONFLICT DO NOTHING;

-- 回填二：手动排序的初值 = 现在页面上的默认顺序（同一层里最近更新的在前，从 0 起）。
-- ⚠ updatedAt 撞在一起时用 id 兜底，结果确定、可重放；原生 SQL 不会碰 updatedAt。
UPDATE "Project" AS p
SET "sortOrder" = ordered."rn"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "userId", "parentId" ORDER BY "updatedAt" DESC, "id") - 1 AS "rn"
  FROM "Project"
  WHERE "isDeleted" = false
) AS ordered
WHERE p."id" = ordered."id";
