-- 2026-10-07 全量数据上量出来的查询计划：
-- · 排序索引必须与 ORDER BY 逐列一致（并以 model_id 升序收尾，即索引自带的
--   rowid 顺序），规划器才会沿它走、够一页就停；否则按过滤条件取出几十万行
--   再整体排序（默认浏览 1.2 秒 → 3 ms）。
-- · 「底模 + 分级」的计数要覆盖索引，否则逐行回表（17 万行 0.48 秒）。
-- · 不到 3 个字的中日韩词 trigram 管不了，原先退回全表 LIKE（0.7 秒）——给名字
--   里的中日韩字另建一份「单字 + 相邻两字」的小索引。
CREATE INDEX IF NOT EXISTS lora_rank_thumbs ON lora (thumbs_up_count DESC, download_count DESC);
CREATE INDEX IF NOT EXISTS lora_base_levels ON lora (base_model, nsfw_level_min, nsfw_level_max);
DROP INDEX IF EXISTS lora_by_thumbs;
DROP INDEX IF EXISTS lora_base_downloads;
DROP INDEX IF EXISTS lora_base_thumbs;
DROP INDEX IF EXISTS lora_base_created;

-- rowid = model_id；grams 由同步写入（见 src/rows.ts 的 cjkGrams）。
CREATE VIRTUAL TABLE lora_cjk USING fts5(grams, tokenize = 'unicode61');

CREATE TRIGGER lora_cjk_delete AFTER DELETE ON lora BEGIN
  DELETE FROM lora_cjk WHERE rowid = old.model_id;
END;
