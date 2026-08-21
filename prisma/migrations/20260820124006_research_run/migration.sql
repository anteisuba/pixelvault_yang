-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surface" "AssistantSurface" NOT NULL,
    "projectId" TEXT,
    "conversationId" TEXT,
    "goal" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "grounded" BOOLEAN NOT NULL,
    "evidence" JSONB NOT NULL,
    "conclusions" JSONB,
    "perSource" JSONB NOT NULL,
    "model" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchRun_userId_createdAt_idx" ON "ResearchRun"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ResearchRun_conversationId_idx" ON "ResearchRun"("conversationId");

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
