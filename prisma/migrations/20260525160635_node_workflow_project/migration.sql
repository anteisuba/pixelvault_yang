-- CreateTable
CREATE TABLE "NodeWorkflowProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeWorkflowProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeWorkflowProject_userId_isDeleted_lastActiveAt_idx" ON "NodeWorkflowProject"("userId", "isDeleted", "lastActiveAt" DESC);

-- AddForeignKey
ALTER TABLE "NodeWorkflowProject" ADD CONSTRAINT "NodeWorkflowProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
