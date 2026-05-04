-- CreateTable
CREATE TABLE "UserCreativePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteStyles" JSONB NOT NULL DEFAULT '[]',
    "rejectedStyles" JSONB NOT NULL DEFAULT '[]',
    "preferredModelsByTask" JSONB NOT NULL DEFAULT '{}',
    "commonNegativeTags" JSONB NOT NULL DEFAULT '[]',
    "preferredAspectRatios" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCreativePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCreativePreference_userId_key" ON "UserCreativePreference"("userId");

-- CreateIndex
CREATE INDEX "UserCreativePreference_userId_idx" ON "UserCreativePreference"("userId");

-- AddForeignKey
ALTER TABLE "UserCreativePreference" ADD CONSTRAINT "UserCreativePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
