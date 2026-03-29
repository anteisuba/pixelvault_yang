-- Enable pg_trgm extension for trigram-based similarity search
-- This allows efficient ILIKE queries with GIN index
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN trigram index on prompt for fast ILIKE searches
-- This dramatically speeds up `WHERE prompt ILIKE '%keyword%'` queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_generation_prompt_trgm
  ON "Generation" USING GIN (prompt gin_trgm_ops);

-- Add GIN trigram index on CharacterCard name for search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_character_card_name_trgm
  ON "CharacterCard" USING GIN (name gin_trgm_ops);
