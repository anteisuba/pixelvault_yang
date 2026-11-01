-- 平台点数第 1 片（docs/design/platform-credits.md）：账本记清是什么、谁出钱、多少点、多少 token / GPU 秒。
-- 全部可空的新列，旧行不动（空 = 第 1 片之前的一次生成）。
ALTER TABLE "ApiUsageLedger" ADD COLUMN "kind" TEXT;
ALTER TABLE "ApiUsageLedger" ADD COLUMN "funding" TEXT;
ALTER TABLE "ApiUsageLedger" ADD COLUMN "points" DECIMAL(12,3);
ALTER TABLE "ApiUsageLedger" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "ApiUsageLedger" ADD COLUMN "cachedInputTokens" INTEGER;
ALTER TABLE "ApiUsageLedger" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "ApiUsageLedger" ADD COLUMN "reasoningTokens" INTEGER;
ALTER TABLE "ApiUsageLedger" ADD COLUMN "gpuSeconds" DOUBLE PRECISION;

CREATE INDEX "ApiUsageLedger_userId_funding_createdAt_idx" ON "ApiUsageLedger"("userId", "funding", "createdAt" DESC);

ALTER TABLE "GenerationJob" ADD COLUMN "funding" TEXT;
