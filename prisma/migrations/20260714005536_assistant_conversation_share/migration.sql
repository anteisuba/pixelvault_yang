-- CreateTable
CREATE TABLE "AssistantConversationShare" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantConversationShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantConversationShare_tokenHash_key" ON "AssistantConversationShare"("tokenHash");

-- CreateIndex
CREATE INDEX "AssistantConversationShare_conversationId_idx" ON "AssistantConversationShare"("conversationId");

-- CreateIndex
CREATE INDEX "AssistantConversationShare_expiresAt_idx" ON "AssistantConversationShare"("expiresAt");

-- AddForeignKey
ALTER TABLE "AssistantConversationShare" ADD CONSTRAINT "AssistantConversationShare_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
