-- 助手设置 B · 规矩并进记忆：项目规则里的普通规则（NOTE）搬进 AssistantMemory。
-- 来源白 / 黑名单（SOURCE_ALLOW / SOURCE_DENY）留在 ProjectRule。
-- 原 id、原 createdAt 照搬；scope 为 null 或不在记忆域词表里的一律进 GLOBAL；
-- 记忆一行最长 200 字，超出的截断。
INSERT INTO "AssistantMemory" ("id", "userId", "scope", "kind", "source", "text", "lastUsedAt", "createdAt", "updatedAt")
SELECT
  "id",
  "userId",
  CASE "scope"
    WHEN 'image' THEN 'IMAGE'::"AssistantMemoryScope"
    WHEN 'video' THEN 'VIDEO'::"AssistantMemoryScope"
    WHEN 'canvas' THEN 'CANVAS'::"AssistantMemoryScope"
    WHEN 'lora' THEN 'LORA'::"AssistantMemoryScope"
    ELSE 'GLOBAL'::"AssistantMemoryScope"
  END,
  'RULE'::"AssistantMemoryKind",
  "source"::text::"AssistantMemorySource",
  LEFT(BTRIM("text"), 200),
  "createdAt",
  "createdAt",
  "createdAt"
FROM "ProjectRule"
WHERE "kind" = 'NOTE'
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "ProjectRule" WHERE "kind" = 'NOTE';
