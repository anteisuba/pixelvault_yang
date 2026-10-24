-- Danbooru 标签的中日文名（第 9f 步 9f-2c 标签库）：新建一张独立的词库表，⛔ 不动任何已有的表。
-- 数据由 scripts/import-danbooru-tag-names.ts 整表覆盖导入（owner 授权后另跑）。

-- CreateTable
CREATE TABLE "DanbooruTagName" (
    "tag" TEXT NOT NULL,
    "category" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "zh" TEXT,
    "zhNote" TEXT,
    "ja" TEXT,
    "searchText" TEXT NOT NULL,

    CONSTRAINT "DanbooruTagName_pkey" PRIMARY KEY ("tag")
);

-- CreateIndex
CREATE INDEX "DanbooruTagName_category_count_idx" ON "DanbooruTagName"("category", "count" DESC);
