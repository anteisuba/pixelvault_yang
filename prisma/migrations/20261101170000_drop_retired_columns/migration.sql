-- 删掉上一版起已停读停写的旧列（lib/db.ts 的 RETIRED_COLUMNS），owner 2026-11-01 同意。
-- · Recipe.visibility：模板「发布到共享库」已拿掉（共享提示词搬到画廊）。
-- · CharacterCard.browse*：角色出门改成一次一趟（CharacterOuting，角色大项目第 ⑤ 步）。

-- DropIndex
DROP INDEX "Recipe_visibility_isDeleted_createdAt_idx";

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "visibility";

-- AlterTable
ALTER TABLE "CharacterCard" DROP COLUMN "browseDailyLimit",
DROP COLUMN "browseEnabled",
DROP COLUMN "browseModel",
DROP COLUMN "browsePausedReason",
DROP COLUMN "browsedAt";
