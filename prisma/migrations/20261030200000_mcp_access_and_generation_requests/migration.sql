-- MCP 扩展到全站（2026-10-30）：令牌权限三档 + 等她确认的出图
ALTER TABLE "McpToken" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'read',
ADD COLUMN "oauthClientId" TEXT;

CREATE TABLE "McpGenerationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenId" TEXT,
    "kind" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "jobIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "McpGenerationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "McpGenerationRequest_userId_status_createdAt_idx" ON "McpGenerationRequest"("userId", "status", "createdAt");

ALTER TABLE "McpGenerationRequest" ADD CONSTRAINT "McpGenerationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "McpGenerationRequest" ADD CONSTRAINT "McpGenerationRequest_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
