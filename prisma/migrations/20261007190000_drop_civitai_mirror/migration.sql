-- Civitai LoRA 库改查 Cloudflare D1 上的全量索引（workers/civitai-index）：
-- 快照兜底、本地镜像与它的同步状态随旧搜索链一起删掉。三张表存的都是从
-- Civitai 公开搜索抄来的缓存，删掉不丢任何用户数据。

-- DropTable
DROP TABLE "CivitaiSearchSnapshot";

-- DropTable
DROP TABLE "CivitaiLoraMirror";

-- DropTable
DROP TABLE "CivitaiMirrorSyncState";
