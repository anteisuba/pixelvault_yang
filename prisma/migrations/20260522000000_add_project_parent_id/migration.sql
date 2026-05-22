-- Add hierarchical folders for asset projects.
ALTER TABLE "Project" ADD COLUMN "parentId" TEXT;

CREATE INDEX "Project_userId_parentId_isDeleted_updatedAt_idx"
  ON "Project"("userId", "parentId", "isDeleted", "updatedAt" DESC);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_parentId_fkey"
  FOREIGN KEY ("parentId")
  REFERENCES "Project"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
