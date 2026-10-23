-- 创作者自己的技能（助手第 7b 步）：新表，只增不改，旧数据不受影响。
-- CreateTable
CREATE TABLE "AssistantSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "body" TEXT,
    "references" JSONB NOT NULL DEFAULT '{}',
    "builtinSlug" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantSkill_userId_updatedAt_idx" ON "AssistantSkill"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSkill_userId_name_key" ON "AssistantSkill"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSkill_userId_builtinSlug_key" ON "AssistantSkill"("userId", "builtinSlug");

-- AddForeignKey
ALTER TABLE "AssistantSkill" ADD CONSTRAINT "AssistantSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

