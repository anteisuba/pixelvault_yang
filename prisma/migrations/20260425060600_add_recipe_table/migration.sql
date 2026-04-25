-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outputType" "OutputType" NOT NULL DEFAULT 'IMAGE',
    "name" TEXT NOT NULL DEFAULT '',
    "userIntent" JSONB,
    "compiledPrompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "params" JSONB,
    "referenceAssets" JSONB,
    "seed" BIGINT,
    "parentGenerationId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "evaluationSummary" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recipe_userId_isDeleted_createdAt_idx" ON "Recipe"("userId", "isDeleted", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
