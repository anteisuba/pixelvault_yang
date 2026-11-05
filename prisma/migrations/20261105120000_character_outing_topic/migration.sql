-- 出门话题（11-05）：每趟可选的话题与回来后的带出处小结。只加一列可空 JSON，旧行为空、读的时候按「没话题」处理。
ALTER TABLE "CharacterOuting" ADD COLUMN "topic" JSONB;
