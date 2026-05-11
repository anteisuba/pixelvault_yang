-- CreateIndex
CREATE INDEX "UserApiKey_userId_adapterType_isActive_createdAt_idx" ON "UserApiKey"("userId", "adapterType", "isActive", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserApiKey_userId_createdAt_idx" ON "UserApiKey"("userId", "createdAt" DESC);
