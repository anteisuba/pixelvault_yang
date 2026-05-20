-- CreateTable
CREATE TABLE "ExtractedElement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceGenerationId" TEXT,
    "sourceImageUrl" TEXT NOT NULL,
    "extractedUrl" TEXT NOT NULL,
    "extractedStorageKey" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "thumbnailStorageKey" TEXT,
    "width" INTEGER NOT NULL DEFAULT 1024,
    "height" INTEGER NOT NULL DEFAULT 1024,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "invert" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractedElement_userId_createdAt_idx" ON "ExtractedElement"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ExtractedElement_sourceGenerationId_idx" ON "ExtractedElement"("sourceGenerationId");

-- AddForeignKey
ALTER TABLE "ExtractedElement" ADD CONSTRAINT "ExtractedElement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedElement" ADD CONSTRAINT "ExtractedElement_sourceGenerationId_fkey" FOREIGN KEY ("sourceGenerationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
