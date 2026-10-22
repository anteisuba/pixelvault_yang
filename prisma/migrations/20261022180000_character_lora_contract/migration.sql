-- 角色③ contract 段：上一版已停读停写 CharacterCard.loras（改走 CharacterCardLora）
-- 和卡上手填的 LoRA 触发词。删前线上 0 行 loras 有值、0 行触发词非空（10 行只有空键），
-- 没有可备份的数据。
ALTER TABLE "CharacterCard" DROP COLUMN "loras";

UPDATE "CharacterCard"
SET "extensions" = jsonb_set("extensions", '{pv.tags}', ("extensions"->'pv.tags') - 'loraTrigger')
WHERE "extensions"->'pv.tags' ? 'loraTrigger';

-- 「加到角色≠收藏」（owner 2026-10-22）：没收藏、只被角色收着的外部 LoRA 记为 false。
-- 既有行全是收藏或自训，默认 true。
ALTER TABLE "LoraAsset" ADD COLUMN     "inLibrary" BOOLEAN NOT NULL DEFAULT true;
