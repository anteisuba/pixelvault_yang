-- CreateTable
CREATE TABLE "LoraAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'trained',
    "type" TEXT NOT NULL DEFAULT 'subject',
    "baseModelFamily" TEXT NOT NULL DEFAULT 'flux',
    "provider" TEXT NOT NULL DEFAULT 'fal',
    "triggerWord" TEXT NOT NULL,
    "loraUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "previewImageUrls" JSONB,
    "coverImageUrl" TEXT,
    "defaultScale" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "trainingJobId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoraAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoraAsset_styleCode_key" ON "LoraAsset"("styleCode");

-- CreateIndex
CREATE UNIQUE INDEX "LoraAsset_trainingJobId_key" ON "LoraAsset"("trainingJobId");

-- CreateIndex
CREATE INDEX "LoraAsset_userId_createdAt_idx" ON "LoraAsset"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoraAsset_source_isPublic_createdAt_idx" ON "LoraAsset"("source", "isPublic", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "LoraAsset" ADD CONSTRAINT "LoraAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraAsset" ADD CONSTRAINT "LoraAsset_trainingJobId_fkey" FOREIGN KEY ("trainingJobId") REFERENCES "LoraTrainingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
