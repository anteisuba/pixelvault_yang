-- 平台点数第 3 片（docs/design/platform-credits.md §2.4）：送点的进账表。新表，不碰旧数据。
-- 注册礼按需补（第一次读余额时），所以这里不批量插存量用户。
CREATE TABLE "CreditGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" DECIMAL(12,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "note" TEXT,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditGrant_dedupeKey_key" ON "CreditGrant"("dedupeKey");
CREATE INDEX "CreditGrant_userId_createdAt_idx" ON "CreditGrant"("userId", "createdAt" DESC);

ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
