-- 数据库收尾（2026-10-22 owner 定 4 项）。删前备份：角色卡整表 R2 backups/character-cards-2026-10-23-290fd4698f48e24441df4e53610b4755.json；3D 任务与 LoRA 底模 R2 backups/2026-10-22-db-cleanup-5dab655032821164fcfb1dd996762304.json。

-- ① 角色卡旧列（角色④ 已搬到 CharacterLook、停读停写）+ ② 作品上没人写的 loraLineage。
-- DropForeignKey
ALTER TABLE "CharacterCard" DROP CONSTRAINT "CharacterCard_parentId_fkey";

-- DropIndex
DROP INDEX "CharacterCard_parentId_isDeleted_updatedAt_idx";

-- AlterTable
ALTER TABLE "Generation" DROP COLUMN "loraLineage";

-- AlterTable
ALTER TABLE "CharacterCard" DROP COLUMN "description",
DROP COLUMN "parentId",
DROP COLUMN "referenceSlots",
DROP COLUMN "variantLabel";


-- ① 旧标签键：两组标签已并进造型的 tags。
UPDATE "CharacterCard" SET "extensions" = "extensions" - 'pv.tags'
WHERE jsonb_typeof("extensions") = 'object' AND "extensions" ? 'pv.tags';

-- ③ 2026-05 的 5 条已完成 3D 任务把侧视图原文（data: base64，共约 24 MB）存进了任务状态；任务已完成，不再读它。
UPDATE "GenerationJob" SET "externalRequestId" = ("externalRequestId"::jsonb - 'multiViewImages')::text
WHERE "status" = 'COMPLETED' AND length("externalRequestId") > 100000
  AND "externalRequestId" LIKE '{%' AND "externalRequestId" LIKE '%data:image%';

-- ④ LoRA 底模写法统一成 Civitai 显示名（与 constants/lora-base-models.ts 的 canonicalLoraBaseModelLabel 同一张表）。
UPDATE "LoraAsset" SET "baseModelFamily" = CASE lower(trim("baseModelFamily"))
    WHEN 'anima-dit' THEN 'Anima'
    WHEN 'sdxl' THEN 'SDXL 1.0'
    WHEN 'sd15' THEN 'SD 1.5'
    WHEN 'flux' THEN 'Flux.1 D'
    WHEN 'illustrious' THEN 'Illustrious'
    WHEN 'pony' THEN 'Pony'
    WHEN 'krea2' THEN 'Krea 2'
  END
WHERE lower(trim("baseModelFamily")) IN ('anima-dit', 'sdxl', 'sd15', 'flux', 'illustrious', 'pony', 'krea2');
