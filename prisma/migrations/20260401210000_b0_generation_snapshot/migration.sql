-- B0: Generation Snapshot + ActiveRun data foundation
-- Adds snapshot storage, run grouping, and seed reproducibility fields

ALTER TABLE "Generation" ADD COLUMN "snapshot" JSONB;
ALTER TABLE "Generation" ADD COLUMN "runGroupId" TEXT;
ALTER TABLE "Generation" ADD COLUMN "runGroupType" TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "Generation" ADD COLUMN "runGroupIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Generation" ADD COLUMN "isWinner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Generation" ADD COLUMN "seed" BIGINT;

CREATE INDEX "Generation_runGroupId_idx" ON "Generation"("runGroupId");
