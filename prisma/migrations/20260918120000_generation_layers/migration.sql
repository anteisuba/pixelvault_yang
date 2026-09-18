-- 图层拆分产物（进度表 62，owner 2026-09-18 授权）。火山 Ark / BytePlus 的
-- Seedream 5.0 Pro 开 `layer_decomposition: true` 时，一次调用返回 1 张底图 +
-- 最多 16 个带 alpha 的 PNG 图层。
--
-- 底图仍然是 Generation 本身（z_index 0），这张表只存 z_index ≥ 1 的图层 ——
-- 一次生成照旧只有一条 Generation，画廊 / seq / credit / GenerationJob 的
-- 一对一关系都不用改。
--
-- ⚠ 这条**不进** prisma/migration-safety.test.ts 的 ACKNOWLEDGED：整条迁移
-- 只有一张新表加它自己的外键与索引，存量数据里没有一行会被校验。
--
-- https://www.volcengine.com/docs/82379/1541523

-- CreateTable
CREATE TABLE "GenerationLayer" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "zIndex" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "description" TEXT,
    "boundingBox" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationLayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationLayer_generationId_zIndex_idx" ON "GenerationLayer"("generationId", "zIndex");

-- AddForeignKey
ALTER TABLE "GenerationLayer" ADD CONSTRAINT "GenerationLayer_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
