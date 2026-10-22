-- 角色② 外观收口（contract 段）：删掉上一版已停读停写的旧列。
-- 删前整表备份 R2 backups/2026-10-22-character-cards-9b6cd6b27e3d00dc1432d92e2a16b0e5.json。

-- DropForeignKey
ALTER TABLE "Generation" DROP CONSTRAINT "Generation_characterCardId_fkey";

-- DropForeignKey
ALTER TABLE "CharacterCard" DROP CONSTRAINT "CharacterCard_projectId_fkey";

-- DropIndex
DROP INDEX "Generation_characterCardId_createdAt_idx";

-- DropIndex
DROP INDEX "CharacterCard_userId_status_isDeleted_idx";

-- DropIndex
DROP INDEX "CharacterCard_userId_projectId_isDeleted_updatedAt_idx";

-- AlterTable
ALTER TABLE "Generation" DROP COLUMN "characterCardId";

-- AlterTable
ALTER TABLE "CharacterCard" DROP COLUMN "allowedStyleRange",
DROP COLUMN "attributes",
DROP COLUMN "characterPrompt",
DROP COLUMN "modelPrompts",
DROP COLUMN "projectId",
DROP COLUMN "provenance",
DROP COLUMN "referenceImages",
DROP COLUMN "referenceRoles",
DROP COLUMN "sourceImageEntries",
DROP COLUMN "sourceImageUrl",
DROP COLUMN "sourceImages",
DROP COLUMN "sourceStorageKey",
DROP COLUMN "stabilityScore",
DROP COLUMN "status";

-- DropEnum
DROP TYPE "CharacterCardStatus";

