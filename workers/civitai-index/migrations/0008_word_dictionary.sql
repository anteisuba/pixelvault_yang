-- 2026-10-27：搜索纠错用的词表（owner 10-22 定「打错字给你是不是要找」）。
-- lora_word = 名字里出现过的拉丁整词与出现在几个模型里（df），从 lora_term 的 w: 词
-- 汇总，每轮同步后重建（见 src/words.ts）；只收 4 个字以上、至少 3 个模型用过的词，
-- 罕见词不当纠错目标。lora_word_fts 按三字组找字形相近的候选词。
CREATE TABLE lora_word (
  word TEXT PRIMARY KEY,
  df INTEGER NOT NULL
);

CREATE VIRTUAL TABLE lora_word_fts USING fts5(
  word,
  content = 'lora_word',
  tokenize = 'trigram'
);
