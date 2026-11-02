-- p-auto-recipe（11-02）：每张作品出图时由服务端记下配方。只加一列可空 JSON，旧行为空、读的时候现补。
ALTER TABLE "Generation" ADD COLUMN "recipe" JSONB;
