-- 记忆按角色分（附录L 第二片 B，owner 2026-10-16 卡上选「现在上」）：和角色聊天时记下的事
-- 只在和这个角色的聊天里注入，⛔ 不进各台；工作里学到的也不进故事。
--
-- 纯新增一列可空的 characterCardId + 一条索引 + 外键（角色卡被真删时它的记忆跟着删）。
-- 不回填：在这之前聊天会话一条都不记（第一片），没有存量要归。
--
-- 回滚：DROP 这一列（连带索引与外键）即回到迁移前，正在跑的旧版本不读这一列。

-- AlterTable
ALTER TABLE "AssistantMemory" ADD COLUMN     "characterCardId" TEXT;

-- CreateIndex
CREATE INDEX "AssistantMemory_userId_characterCardId_updatedAt_idx" ON "AssistantMemory"("userId", "characterCardId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "AssistantMemory" ADD CONSTRAINT "AssistantMemory_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
