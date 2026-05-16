CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_generation_prompt_trgm
  ON "Generation" USING GIN (prompt gin_trgm_ops);
