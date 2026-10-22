-- 标签堆进库（2026-10-22 owner 定）：LoRA 台的标签堆从浏览器搬到账号里，一个用户一行。
-- 顺带删数据库收尾（20261023120000_db_cleanup）停用的 Generation.loraLineage（0 行有值，上一版已不查它）。

-- AlterTable
ALTER TABLE "Generation" DROP COLUMN "loraLineage";

-- CreateTable
CREATE TABLE "PromptTagStack" (
    "userId" TEXT NOT NULL,
    "positive" JSONB NOT NULL DEFAULT '[]',
    "negative" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTagStack_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "PromptTagStack" ADD CONSTRAINT "PromptTagStack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

