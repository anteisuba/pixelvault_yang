-- 第三期 K1 · 上下文卡（角色 / 风格 / 品牌）
-- 账号级持久上下文：可 @ 注入、可按域常挂。
--
-- **一张新表 + 一个新枚举**。没有一条语句碰既有表的数据或约束，所以它不进
-- prisma/migration-safety.test.ts 的 ACKNOWLEDGED（那份登记簿只收「给已存在的表
-- 加约束」的迁移）。

-- CreateEnum
CREATE TYPE "ContextCardKind" AS ENUM ('CHARACTER', 'STYLE', 'BRAND');

-- CreateTable
CREATE TABLE "ContextCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ContextCardKind" NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "negative" TEXT,
    "pinnedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContextCard_userId_updatedAt_idx" ON "ContextCard"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ContextCard_userId_kind_updatedAt_idx" ON "ContextCard"("userId", "kind", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "ContextCard" ADD CONSTRAINT "ContextCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
