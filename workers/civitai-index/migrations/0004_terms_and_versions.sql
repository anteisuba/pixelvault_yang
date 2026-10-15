-- 2026-10-15：
-- · 一个模型的全部版本（每版的底模 / 触发词 / 哈希）存成 JSON。原先只存 Civitai
--   默认展示的那一版，多底模模型（krea2 + anima + il 三版）在其他底模筛选下整个
--   消失，其他版本的触发词也搜不到。
-- · lora_term：精确词 → 模型的 B 树表，替掉 trigram 管不好的那几类条件（实测冷查询
--   5–11 秒）：
--     w:<词>   名字里的整词（小写），以及中日韩字的单字与相邻两字
--     t:<标签> 标签原文（小写），内容类型筛选用
--     b:<底模> 非默认版本的底模，底模筛选「任一版本符合」用
--   词由同步写入（见 src/rows.ts 的 indexTerms）。
ALTER TABLE lora ADD COLUMN versions TEXT NOT NULL DEFAULT '[]';

CREATE TABLE lora_term (
  term TEXT NOT NULL,
  model_id INTEGER NOT NULL,
  PRIMARY KEY (term, model_id)
) WITHOUT ROWID;

CREATE INDEX lora_term_by_model ON lora_term (model_id);

CREATE TRIGGER lora_term_delete AFTER DELETE ON lora BEGIN
  DELETE FROM lora_term WHERE model_id = old.model_id;
END;
