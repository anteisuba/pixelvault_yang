-- 角色② 外观收口（expand 段）：外观文字并成一列，旧图列停写。
-- 删列在下一次部署（contract 段）；原值已整表备份到 R2
-- backups/2026-10-22-character-cards-9b6cd6b27e3d00dc1432d92e2a16b0e5.json。

-- 1. 角色提示词并进外观：提示词在前、外观在后，换行隔开；两段相同只留一段
--    （与旧编译器拼视觉文字同一条规则，出图结果不变）。
UPDATE "CharacterCard"
SET
  "description" = CASE
    WHEN COALESCE(TRIM("description"), '') = '' THEN TRIM("characterPrompt")
    WHEN TRIM("description") = TRIM("characterPrompt") THEN TRIM("description")
    ELSE TRIM("characterPrompt") || E'\n' || TRIM("description")
  END,
  "characterPrompt" = ''
WHERE TRIM("characterPrompt") <> '';

-- 2. 新代码不再写这三列，给默认值让建卡不必再填。
ALTER TABLE "CharacterCard" ALTER COLUMN "sourceImageUrl" SET DEFAULT '';
ALTER TABLE "CharacterCard" ALTER COLUMN "sourceStorageKey" SET DEFAULT '';
ALTER TABLE "CharacterCard" ALTER COLUMN "characterPrompt" SET DEFAULT '';
