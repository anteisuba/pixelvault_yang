-- 没有搜索词的总数（浏览 / 底模 / 类型 / 分级的组合）一天内不变，而类型筛选
-- 与「其他」底模的计数要 0.1–0.3 秒：按「条件 + 最近一次同步完成时刻」存一份。
-- 同步完成时清掉旧的（见 src/sync.ts 的 recordSyncCompleted）。
CREATE TABLE count_cache (
  key TEXT PRIMARY KEY,
  synced_at INTEGER NOT NULL,
  total INTEGER NOT NULL
);
