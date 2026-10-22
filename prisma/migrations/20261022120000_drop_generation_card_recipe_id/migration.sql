-- 角色① 清死代码（owner 2026-10-22 角色功能拆分第 1 步）：删作品上的卡片配方列。
-- 卡片配方表与外键已在 20261021120000 删掉，当时为了上线窗口里旧部署还会 select
-- 全部标量列，只摘外键不删列；那一版已稳定上线，代码不再读写这一列。
--
-- 存量：2026-10-22 只读查询生产 Generation 1821 行，cardRecipeId 非空 0 行，不需要备份。
--
-- 回滚：ALTER TABLE "Generation" ADD COLUMN "cardRecipeId" TEXT;（无数据可回）

-- AlterTable
ALTER TABLE "Generation" DROP COLUMN IF EXISTS "cardRecipeId";
