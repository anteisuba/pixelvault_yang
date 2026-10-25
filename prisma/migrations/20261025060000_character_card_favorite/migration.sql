-- 库骨架：角色库左栏「收藏」（owner 2026-10-25 定加列）。带默认值的新列，旧数据全是未收藏。
ALTER TABLE "CharacterCard" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
