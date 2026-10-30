-- 角色大项目第 ⑥ 步：出门看视频（每个来源一个开关 + 指定视频）
ALTER TABLE "CharacterOuting" ADD COLUMN "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CharacterOuting" ADD COLUMN "pinnedVideos" JSONB;
ALTER TABLE "CharacterOuting" ADD COLUMN "pinnedDone" BOOLEAN NOT NULL DEFAULT false;
