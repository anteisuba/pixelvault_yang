-- A1 · 助手历史按域隔离（docs/plans/assistant-ab-design-2026-08-08.md §1.6）
--
-- 改之前 `AssistantSurface` 只有 STUDIO / NODE_CANVAS：画布是隔离的（还额外按
-- projectId 分槽），但图片 Studio / 视频 Studio / LoRA 三处全挤在 STUDIO 这一个值
-- 里，历史列表混着。拆成每域一档。
--
-- 存量 STUDIO 行 → IMAGE_STUDIO（owner 2026-08-08 拍板：归图片档，不删。那是用户
-- 真实的对话历史，「过时的直接删」那条原则管的是代码不是用户数据）。
--
-- ⚠ 手写而不是让 Prisma 生成：Postgres 删枚举值必须重建类型，而 Prisma 生成的
-- `USING "surface"::text::"AssistantSurface_new"` 对存量的 'STUDIO' 会直接报错。
-- 值的改写必须和类型替换在同一条 ALTER 里完成。
BEGIN;

CREATE TYPE "AssistantSurface_new" AS ENUM ('IMAGE_STUDIO', 'VIDEO_STUDIO', 'LORA', 'NODE_CANVAS');

ALTER TABLE "AssistantConversation"
  ALTER COLUMN "surface" TYPE "AssistantSurface_new"
  USING (
    CASE "surface"::text
      WHEN 'STUDIO' THEN 'IMAGE_STUDIO'
      ELSE "surface"::text
    END
  )::"AssistantSurface_new";

ALTER TYPE "AssistantSurface" RENAME TO "AssistantSurface_old";
ALTER TYPE "AssistantSurface_new" RENAME TO "AssistantSurface";
DROP TYPE "AssistantSurface_old";

COMMIT;
