-- CreateTable
CREATE TABLE "DanbooruFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "work" TEXT,
    "previews" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DanbooruFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DanbooruFavorite_userId_createdAt_idx" ON "DanbooruFavorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DanbooruFavorite_userId_kind_name_key" ON "DanbooruFavorite"("userId", "kind", "name");

-- AddForeignKey
ALTER TABLE "DanbooruFavorite" ADD CONSTRAINT "DanbooruFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
