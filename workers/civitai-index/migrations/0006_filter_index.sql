-- 2026-10-22：「搜词 + 底模 / 分级」的计数是从全文命中逐条回表看筛选列。lora 一行
-- 1.3 KB 上下（图片、版本 JSON），常见词（girl 17 万命中）要把大半张表读一遍：
-- 冷的时候 4 秒以上，尾巴超过应用侧的 8 秒超时，LoRA 库就刷新不出来。筛选只看
-- 下面这几列，按 model_id 另建一份只含它们的覆盖索引（一条几十字节），计数与取
-- 候选都走它、不碰大行（见 src/search.ts 的 FILTER_INDEX）。
CREATE INDEX IF NOT EXISTS lora_filter ON lora (model_id, base_model, nsfw_level_min, nsfw_level_max);
