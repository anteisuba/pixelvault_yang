-- 同一个人不能收藏同一个 LoRA 两次。
-- 应用层幂等（findFirst 再 create）挡不住并发：2026-08-21 清出两组重复，
-- 相差 5ms 与 184ms，都是双击。清理后补约束，写入侧同批改成撞 P2002 返回既有行。
-- ⚠ userId 可空（curated 平台 LoRA 无主）；Postgres unique 对 NULL 不去重，
--   所以这条只约束「有主」的收藏，正是想要的语义。
CREATE UNIQUE INDEX "LoraAsset_userId_loraUrl_key" ON "LoraAsset"("userId", "loraUrl");
