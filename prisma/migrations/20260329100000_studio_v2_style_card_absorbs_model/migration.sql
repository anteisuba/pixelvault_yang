-- Studio V2: StyleCard absorbs ModelCard fields + User gets civitaiToken

ALTER TABLE "StyleCard"
  ADD COLUMN IF NOT EXISTS "modelId"        TEXT,
  ADD COLUMN IF NOT EXISTS "adapterType"    TEXT,
  ADD COLUMN IF NOT EXISTS "advancedParams" JSONB;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "civitaiToken" TEXT;
