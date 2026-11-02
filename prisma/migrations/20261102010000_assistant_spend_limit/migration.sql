-- 助手自己出图的上限（p-assistant-autonomy，owner 11-02）：一句话里加起来不超过这么多点就直接出，超了停在确认卡上。
-- 1 点 = $0.01；默认 100 = $1。只加一列，旧行取默认值。
ALTER TABLE "AssistantPersona" ADD COLUMN "spendLimitPoints" INTEGER NOT NULL DEFAULT 100;
