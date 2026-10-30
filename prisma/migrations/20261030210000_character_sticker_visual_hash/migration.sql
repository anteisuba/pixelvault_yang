-- 表情包相似图去重（角色大项目第 ⑨ 步）：长相指纹 + 像素数，旧行为空、读到时补上。
ALTER TABLE "CharacterSticker" ADD COLUMN "visualHash" TEXT;
ALTER TABLE "CharacterSticker" ADD COLUMN "pixels" INTEGER;
