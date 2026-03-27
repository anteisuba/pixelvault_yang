-- AlterTable
ALTER TABLE "ModelEloRating" ADD COLUMN "modelFamily" TEXT;

-- CreateIndex
CREATE INDEX "ModelEloRating_modelFamily_rating_idx" ON "ModelEloRating"("modelFamily", "rating" DESC);
