ALTER TABLE "UserApiKey"
  RENAME COLUMN "provider" TO "modelId";

ALTER TABLE "UserApiKey"
  ADD COLUMN "providerType" TEXT;

UPDATE "UserApiKey"
SET "providerType" = CASE
  WHEN "modelId" IN ('sdxl', 'animagine-xl-4.0') THEN 'huggingface'
  WHEN "modelId" = 'gemini-3.1-flash-image-preview' THEN 'gemini'
  ELSE 'huggingface'
END;

ALTER TABLE "UserApiKey"
  ALTER COLUMN "providerType" SET NOT NULL;

DROP INDEX IF EXISTS "UserApiKey_userId_provider_idx";

CREATE INDEX "UserApiKey_userId_modelId_idx" ON "UserApiKey"("userId", "modelId");
