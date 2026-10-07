-- Civitai LoRA 全量索引。一行 = Civitai 上一个 LoRA 类模型（LoRA / LoCon / DoRA），
-- 展示的是 Civitai 自己挑的那个版本。字段由「渲染一条 CivitaiLoraLibraryItem 要什么」
-- 倒推，搜索与浏览一次上游请求都不发。数组与图片存 JSON 文本。
CREATE TABLE lora (
  model_id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL,
  version_name TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  creator_image TEXT,
  model_type TEXT NOT NULL,
  -- Civitai 自己的 NSFW 标记（详情页展示用；筛选看下面的分级）
  nsfw INTEGER NOT NULL DEFAULT 0,
  -- 该模型所有图片 nsfwLevel 的最小 / 最大值。三态是「存在」语义（owner
  -- 2026-09-27）：安全 = 至少一张 ≤ 线（看 min），仅 NSFW = 至少一张 > 线（看 max）。
  nsfw_level_min INTEGER NOT NULL DEFAULT 0,
  nsfw_level_max INTEGER NOT NULL DEFAULT 0,
  base_model TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  trained_words TEXT NOT NULL DEFAULT '[]',
  hash_autov3 TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  thumbs_up_count INTEGER NOT NULL DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]',
  -- 授权：{ allowCommercialUse: string[], allowDerivatives, allowNoCredit }
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  last_version_at INTEGER NOT NULL,
  -- 轻量扫描看得到的字段（名字 / 分级 / 标签 / 最新版本时刻）的指纹。
  -- 每日同步只对指纹变了或新出现的模型拉完整数据。
  light_fp TEXT NOT NULL,
  -- 最近一次拉完整数据的时刻（unix ms）
  refreshed_at INTEGER NOT NULL
);

CREATE INDEX lora_by_downloads ON lora (download_count DESC);
CREATE INDEX lora_by_thumbs ON lora (thumbs_up_count DESC);
CREATE INDEX lora_by_created ON lora (created_at DESC);
CREATE INDEX lora_base_downloads ON lora (base_model, download_count DESC);
CREATE INDEX lora_base_thumbs ON lora (base_model, thumbs_up_count DESC);
CREATE INDEX lora_base_created ON lora (base_model, created_at DESC);
CREATE INDEX lora_by_level_min ON lora (nsfw_level_min);
CREATE INDEX lora_by_level_max ON lora (nsfw_level_max);

-- 全文索引：trigram 分词 = 任意 ≥3 字的子串都能命中，中日文名也一样。
-- 不到 3 个字的词由查询侧退回 LIKE（见 src/search.ts）。
CREATE VIRTUAL TABLE lora_fts USING fts5(
  name,
  creator,
  tags,
  trained_words,
  content = 'lora',
  content_rowid = 'model_id',
  tokenize = 'trigram'
);

CREATE TRIGGER lora_fts_insert AFTER INSERT ON lora BEGIN
  INSERT INTO lora_fts (rowid, name, creator, tags, trained_words)
  VALUES (new.model_id, new.name, new.creator, new.tags, new.trained_words);
END;

CREATE TRIGGER lora_fts_delete AFTER DELETE ON lora BEGIN
  INSERT INTO lora_fts (lora_fts, rowid, name, creator, tags, trained_words)
  VALUES ('delete', old.model_id, old.name, old.creator, old.tags, old.trained_words);
END;

-- 只在文字列出现在 SET 里时才重建这一行的全文索引；只改下载量 / 点赞的
-- 每日指标更新不碰它。
CREATE TRIGGER lora_fts_update AFTER UPDATE OF name, creator, tags, trained_words ON lora BEGIN
  INSERT INTO lora_fts (lora_fts, rowid, name, creator, tags, trained_words)
  VALUES ('delete', old.model_id, old.name, old.creator, old.tags, old.trained_words);
  INSERT INTO lora_fts (rowid, name, creator, tags, trained_words)
  VALUES (new.model_id, new.name, new.creator, new.tags, new.trained_words);
END;

-- 单行表：最近一次完整同步的结果。
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_completed_at INTEGER,
  last_error TEXT,
  row_count INTEGER
);

INSERT INTO sync_state (id) VALUES (1);
