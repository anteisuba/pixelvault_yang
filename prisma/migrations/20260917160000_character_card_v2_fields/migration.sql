-- 角色卡字段 v2（进度表 27，owner 2026-09-17 授权）——把图片 / 视频 / 语音 / 画布
-- 串成同一个命名实体。字段语义、谁写谁读、与画布 11 类参考角色词表的对齐关系见
-- docs/references/domains/cards.md 的「角色卡字段 v2」一节。
--
-- ⚠ 六个新列**全部可空**，第七个 "version" 非空但**带 DEFAULT 1** —— 在有存量行的
-- 表上都建得上（可空列存量行填 NULL，带默认的非空列存量行填 1）。
-- ⛔ 不写 UPDATE 回填：NULL 就是「这张旧卡还没有 v2 内容」的真实值，不是待填坑。
--
-- "voiceCardId" 是**软引用**：SET NULL 而不是 CASCADE —— 删掉一张音色卡只该把角色
-- 的嗓子解绑，⛔ 不该连角色卡一起删（ownership 关系才用 CASCADE，见
-- docs/references/database.md 迁移纪律 5）。
--
-- ⚠ 这条**进** prisma/migration-safety.test.ts 的 ACKNOWLEDGED：外键是
-- ADD CONSTRAINT，闸门按语句形状认它。理由写在那份登记簿里（一句话：新列此刻
-- 全表为 NULL，而 NULL 不参与外键校验，所以这条约束在任何存量数据上都成立）。

-- AlterTable
ALTER TABLE "CharacterCard" ADD COLUMN     "voiceCardId" TEXT,
ADD COLUMN     "voiceProfile" JSONB,
ADD COLUMN     "persona" JSONB,
ADD COLUMN     "referenceRoles" JSONB,
ADD COLUMN     "allowedStyleRange" JSONB,
ADD COLUMN     "provenance" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "CharacterCard_voiceCardId_idx" ON "CharacterCard"("voiceCardId");

-- AddForeignKey
ALTER TABLE "CharacterCard" ADD CONSTRAINT "CharacterCard_voiceCardId_fkey" FOREIGN KEY ("voiceCardId") REFERENCES "VoiceCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
