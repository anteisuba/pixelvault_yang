-- AlterTable
ALTER TABLE "GenerationCharacterCard" ADD COLUMN     "lookId" TEXT;

-- AlterTable
ALTER TABLE "CharacterCardLora" ADD COLUMN     "lookId" TEXT;

-- AlterTable
ALTER TABLE "LoraTrainingJob" ADD COLUMN     "lookId" TEXT;

-- CreateTable
CREATE TABLE "CharacterLook" (
    "id" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referenceSlots" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterLook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterLook_characterCardId_sortOrder_idx" ON "CharacterLook"("characterCardId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CharacterLook" ADD CONSTRAINT "CharacterLook_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationCharacterCard" ADD CONSTRAINT "GenerationCharacterCard_lookId_fkey" FOREIGN KEY ("lookId") REFERENCES "CharacterLook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCardLora" ADD CONSTRAINT "CharacterCardLora_lookId_fkey" FOREIGN KEY ("lookId") REFERENCES "CharacterLook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoraTrainingJob" ADD CONSTRAINT "LoraTrainingJob_lookId_fkey" FOREIGN KEY ("lookId") REFERENCES "CharacterLook"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── 搬数据（角色④）──────────────────────────────────────────────
-- 1. 每张根卡现在的外观文字、图、标签 → 它的默认造型。两组标签合成一组（角色在前）。
INSERT INTO "CharacterLook" ("id", "characterCardId", "label", "isDefault", "description", "tags", "referenceSlots", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  NULL,
  true,
  c."description",
  COALESCE(ARRAY(
    SELECT t.tag FROM (
      SELECT x.tag, MIN(x.ord) AS ord FROM (
        SELECT e.value AS tag, e.ordinality AS ord
          FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c."extensions"->'pv.tags'->'character') = 'array' THEN c."extensions"->'pv.tags'->'character' ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value, ordinality)
        UNION ALL
        SELECT e.value, e.ordinality + 1000
          FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c."extensions"->'pv.tags'->'appearance') = 'array' THEN c."extensions"->'pv.tags'->'appearance' ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value, ordinality)
      ) AS x GROUP BY x.tag
    ) AS t ORDER BY t.ord
  ), ARRAY[]::TEXT[]),
  CASE WHEN jsonb_typeof(c."referenceSlots") = 'array' THEN c."referenceSlots" ELSE '[]'::jsonb END,
  0,
  c."createdAt",
  CURRENT_TIMESTAMP
FROM "CharacterCard" c
WHERE c."parentId" IS NULL;

-- 2. 没删的变体 → 父卡的一套造型（造型 id 沿用变体卡 id，方便下面改挂）。
INSERT INTO "CharacterLook" ("id", "characterCardId", "label", "isDefault", "description", "tags", "referenceSlots", "sortOrder", "createdAt", "updatedAt")
SELECT
  v."id",
  v."parentId",
  COALESCE(NULLIF(TRIM(v."variantLabel"), ''), v."name"),
  false,
  v."description",
  COALESCE(ARRAY(
    SELECT DISTINCT e.value FROM jsonb_array_elements_text(
      (CASE WHEN jsonb_typeof(v."extensions"->'pv.tags'->'character') = 'array' THEN v."extensions"->'pv.tags'->'character' ELSE '[]'::jsonb END)
      || (CASE WHEN jsonb_typeof(v."extensions"->'pv.tags'->'appearance') = 'array' THEN v."extensions"->'pv.tags'->'appearance' ELSE '[]'::jsonb END)
    ) AS e(value)
  ), ARRAY[]::TEXT[]),
  CASE WHEN jsonb_typeof(v."referenceSlots") = 'array' THEN v."referenceSlots" ELSE '[]'::jsonb END,
  ROW_NUMBER() OVER (PARTITION BY v."parentId" ORDER BY v."createdAt"),
  v."createdAt",
  CURRENT_TIMESTAMP
FROM "CharacterCard" v
WHERE v."parentId" IS NOT NULL AND v."isDeleted" = false;

-- 3. 挂在变体上的东西改挂到父卡 + 那套造型。同一张图 / 同一个 LoRA 父卡已挂过的，丢掉变体那条。
DELETE FROM "GenerationCharacterCard" g USING "CharacterCard" v
WHERE g."characterCardId" = v."id" AND v."parentId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "GenerationCharacterCard" p WHERE p."generationId" = g."generationId" AND p."characterCardId" = v."parentId");
UPDATE "GenerationCharacterCard" g SET "characterCardId" = v."parentId", "lookId" = v."id"
FROM "CharacterCard" v
WHERE g."characterCardId" = v."id" AND v."parentId" IS NOT NULL AND v."isDeleted" = false;

DELETE FROM "CharacterCardLora" l USING "CharacterCard" v
WHERE l."characterCardId" = v."id" AND v."parentId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "CharacterCardLora" p WHERE p."loraAssetId" = l."loraAssetId" AND p."characterCardId" = v."parentId");
UPDATE "CharacterCardLora" l SET "characterCardId" = v."parentId", "lookId" = v."id"
FROM "CharacterCard" v
WHERE l."characterCardId" = v."id" AND v."parentId" IS NOT NULL AND v."isDeleted" = false;

UPDATE "LoraTrainingJob" j SET "characterCardId" = v."parentId", "lookId" = v."id"
FROM "CharacterCard" v
WHERE j."characterCardId" = v."id" AND v."parentId" IS NOT NULL AND v."isDeleted" = false;

UPDATE "AssistantPersona" a SET "characterCardId" = v."parentId"
FROM "CharacterCard" v
WHERE a."characterCardId" = v."id" AND v."parentId" IS NOT NULL;

UPDATE "AssistantMemory" m SET "characterCardId" = v."parentId"
FROM "CharacterCard" v
WHERE m."characterCardId" = v."id" AND v."parentId" IS NOT NULL;

-- 4. 剩下的出图记录记成默认造型（之前出图用的就是卡上那份外观）。
UPDATE "GenerationCharacterCard" g SET "lookId" = l."id"
FROM "CharacterLook" l
WHERE g."lookId" IS NULL AND l."characterCardId" = g."characterCardId" AND l."isDefault" = true;

-- 5. 变体卡删掉（整表已备份到 R2：backups/character-cards-2026-10-23-290fd4698f48e24441df4e53610b4755.json）。
DELETE FROM "CharacterCard" WHERE "parentId" IS NOT NULL;
