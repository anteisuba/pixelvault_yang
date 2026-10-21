-- 风格卡、背景卡、视频脚本面板下线（owner 2026-10-21：卡片模式只留角色，删脚本面板留训练；
-- 风格卡 / 背景卡还有存货时选「备份后照删」）。代码在同一个改动里一起删了。
--
-- 存量：StyleCard 7、BackgroundCard 2、VideoScript 1、VideoScriptScene 20。删前整表备份到 R2
-- backups/2026-10-21-dropped-cards-scripts-87f489c1e3aa7db8ab6b76b0fd3af7d2.json。
-- 指向这两种卡的 CardRecipe 外键已随 20261021120000 那张表一起没了。
--
-- 回滚：表结构见上一版 schema.prisma；数据从 R2 备份导回。

-- DropTable
DROP TABLE IF EXISTS "VideoScriptScene";

-- DropTable
DROP TABLE IF EXISTS "VideoScript";

-- DropTable
DROP TABLE IF EXISTS "StyleCard";

-- DropTable
DROP TABLE IF EXISTS "BackgroundCard";

-- DropEnum
DROP TYPE IF EXISTS "VideoScriptSceneStatus";

-- DropEnum
DROP TYPE IF EXISTS "VideoScriptStatus";
