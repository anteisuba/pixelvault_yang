-- 「先搜再画」（2026-10-07）：生成记录上记「出图时用了 Google 搜索」，公开接口按它拦。
-- 纯新增、默认 false、不回填 —— 上线前还没有这类图。

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "searchGrounded" BOOLEAN NOT NULL DEFAULT false;
