-- 角色大项目第 ⑦ 步：记忆的有效期 / 提及次数 / 沉睡 / 钉住
ALTER TABLE "AssistantMemory" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "mentions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dormantAt" TIMESTAMP(3),
ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
