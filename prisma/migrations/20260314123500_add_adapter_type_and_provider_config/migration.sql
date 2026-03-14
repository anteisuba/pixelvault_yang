ALTER TABLE "UserApiKey"
  RENAME COLUMN "providerType" TO "adapterType";

ALTER TABLE "UserApiKey"
  ADD COLUMN "providerConfig" JSONB;

UPDATE "UserApiKey"
SET "providerConfig" = CASE
  WHEN "adapterType" = 'huggingface' THEN jsonb_build_object(
    'label',
    'HuggingFace',
    'baseUrl',
    'https://router.huggingface.co/hf-inference/models'
  )
  WHEN "adapterType" = 'gemini' THEN jsonb_build_object(
    'label',
    'Gemini',
    'baseUrl',
    'https://generativelanguage.googleapis.com/v1beta/models'
  )
  ELSE jsonb_build_object(
    'label',
    'Custom provider',
    'baseUrl',
    'https://example.com'
  )
END;

ALTER TABLE "UserApiKey"
  ALTER COLUMN "providerConfig" SET NOT NULL;

DROP INDEX IF EXISTS "UserApiKey_userId_modelId_idx";

CREATE INDEX "UserApiKey_userId_modelId_adapterType_idx"
  ON "UserApiKey"("userId", "modelId", "adapterType");
