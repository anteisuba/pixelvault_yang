-- 第 9f 步 9f-3：出图任务记下属于哪段对话；对话记下最后开着的台。两列都可空，旧数据不动。
ALTER TABLE "GenerationJob" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "AssistantConversation" ADD COLUMN "bench" TEXT;

CREATE INDEX "GenerationJob_conversationId_createdAt_idx" ON "GenerationJob"("conversationId", "createdAt" DESC);
