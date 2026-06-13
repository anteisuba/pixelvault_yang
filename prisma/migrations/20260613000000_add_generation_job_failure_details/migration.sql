ALTER TABLE "GenerationJob"
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "providerFailure" JSONB;
