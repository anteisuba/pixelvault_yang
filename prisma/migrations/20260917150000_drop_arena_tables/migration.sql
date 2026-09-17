-- Arena 已于 e8d4d551 整删（UI / 路由 / 对战 API 早在 2026-09-05 移除，
-- 2026-09-17 删掉 win-rate boost、schema 声明与文档）。这里把三张表从库里去掉，
-- 让 `prisma migrate diff --from-migrations --to-schema` 重新对齐。
--
-- 顺序：ArenaEntry 持有指向 ArenaMatch 与 Generation 的外键，先删它；
-- ModelEloRating 独立无外键。三张表的历史对战 / Elo 数据随之删除，
-- owner 2026-09-17 授权（已确认无消费者）。
--
-- ⛔ 不进 prisma/migration-safety.test.ts 的 ACKNOWLEDGED：那份登记簿只收
-- 唯一索引 / SET NOT NULL / 改列类型 / 非空无默认新列，DROP TABLE 不在其列。

-- DropTable
DROP TABLE IF EXISTS "ArenaEntry";

-- DropTable
DROP TABLE IF EXISTS "ArenaMatch";

-- DropTable
DROP TABLE IF EXISTS "ModelEloRating";
