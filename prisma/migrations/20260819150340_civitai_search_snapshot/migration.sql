-- CreateTable
CREATE TABLE "CivitaiSearchSnapshot" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CivitaiSearchSnapshot_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CivitaiSearchSnapshot_lastUsedAt_idx" ON "CivitaiSearchSnapshot"("lastUsedAt");
