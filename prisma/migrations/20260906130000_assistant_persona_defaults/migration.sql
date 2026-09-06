-- AlterTable: 只改默认值，⛔ 不动存量行（已存的用户选择保持原样）
ALTER TABLE "AssistantPersona" ALTER COLUMN "tone" SET DEFAULT 'terse';
ALTER TABLE "AssistantPersona" ALTER COLUMN "verbosity" SET DEFAULT 'concise';
