-- CreateEnum
CREATE TYPE "AssistantSurface" AS ENUM ('STUDIO', 'NODE_CANVAS');

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surface" "AssistantSurface" NOT NULL,
    "projectId" TEXT,
    "title" TEXT,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_userId_surface_updatedAt_idx" ON "AssistantConversation"("userId", "surface", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AssistantConversation_projectId_idx" ON "AssistantConversation"("projectId");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
