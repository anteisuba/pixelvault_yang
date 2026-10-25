-- 2026-10-25：LoRA 按意思搜（语义检索）。每行算过向量时记下当时的 light_fp；名字 /
-- 标签 / 版本一变 light_fp 就变，两者不等 = 要（重）算。部分索引只收要算的那些行：
-- 首灌之后它几乎是空的，每天找「要算的」不用扫全表（见 src/meaning.ts）。
ALTER TABLE lora ADD COLUMN embedded_fp TEXT;
CREATE INDEX IF NOT EXISTS lora_embed_pending ON lora (model_id) WHERE embedded_fp IS NOT light_fp;
