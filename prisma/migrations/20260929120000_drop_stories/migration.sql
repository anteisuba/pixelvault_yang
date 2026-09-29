-- 故事板整删（2026-09-29）：页面与 `/api/stories` 已随代码删掉。
-- 删之前在生产库只读核对过：Story 0 行、StoryPanel 0 行，不丢数据。

-- DropForeignKey
ALTER TABLE "Story" DROP CONSTRAINT "Story_userId_fkey";

-- DropForeignKey
ALTER TABLE "StoryPanel" DROP CONSTRAINT "StoryPanel_storyId_fkey";

-- DropForeignKey
ALTER TABLE "StoryPanel" DROP CONSTRAINT "StoryPanel_generationId_fkey";

-- DropTable
DROP TABLE "Story";

-- DropTable
DROP TABLE "StoryPanel";
