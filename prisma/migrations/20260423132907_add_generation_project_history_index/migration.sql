-- CreateIndex
CREATE INDEX "Generation_userId_projectId_createdAt_idx" ON "Generation"("userId", "projectId", "createdAt" DESC);
