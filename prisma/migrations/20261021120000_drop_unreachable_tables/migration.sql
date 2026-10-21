-- 删掉没有入口的四块功能的表（owner 2026-10-21 数据库体检「删空表」按建议做）：
-- 合集 Collection / CollectionItem、图片分析 ImageAnalysis、卡片配方 CardRecipe、
-- 长视频管线 VideoPipeline / VideoPipelineClip。代码在同一个改动里一起删了。
--
-- 存量：合集与长视频 0 行；ImageAnalysis 41 行（最后写入 2026-06-14，早已无代码读写）、
-- CardRecipe 5 行（全是 isDeleted 的 _temp_compile 残留）。删前整表备份到 R2
-- backups/2026-10-21-dropped-tables-681d6319e4c7725aafb329ea83927a7b.json。
--
-- ⚠ Generation.cardRecipeId 这一列这次只摘外键不删列：上线窗口里旧部署还会
--   select 全部标量列，等新版本稳定后由单独一条迁移删列。
--
-- 回滚：表结构见上一版 schema.prisma；数据从 R2 备份导回。

-- DropForeignKey
ALTER TABLE "Generation" DROP CONSTRAINT IF EXISTS "Generation_cardRecipeId_fkey";

-- DropTable
DROP TABLE IF EXISTS "CollectionItem";

-- DropTable
DROP TABLE IF EXISTS "Collection";

-- DropTable
DROP TABLE IF EXISTS "ImageAnalysis";

-- DropTable
DROP TABLE IF EXISTS "CardRecipe";

-- DropTable
DROP TABLE IF EXISTS "VideoPipelineClip";

-- DropTable
DROP TABLE IF EXISTS "VideoPipeline";

-- DropEnum
DROP TYPE IF EXISTS "PipelineClipStatus";

-- DropEnum
DROP TYPE IF EXISTS "VideoPipelineStatus";
