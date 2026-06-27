# Migration drift 恢复笔记（2026-06-27）

> 起因：实现 LoRA 域第一档（加 `Generation.sourceSurface`）时 `prisma migrate dev` 要求 reset 整库，排查发现既有 drift。本文记录诊断、当前安全态、精确 SQL 与恢复步骤。**勿 `migrate reset`（会清空 prod neondb 全部数据）。**

## 诊断

- **孤儿 migration** `20260531090000_prompt_core_recipe_assets`：已应用到 prod DB 且记录在 `_prisma_migrations` 账本，但**文件在本地、`origin`、git 任何 ref 都不存在**（也非未跟踪文件）。多半是 Mac/Codex 那台机直接对 DB 跑了迁移、从未 commit。
- 它给 `Recipe` 表加了 8 列 + 1 索引（见下 SQL）；本地 `schema.prisma` 原先缺这些，于是 `db push` 想反向删（被拒，无数据丢失）、`migrate dev` 想 reset。
- 另：本次 `sourceSurface`/`loraLineage`/索引 因账本被堵，**用 raw SQL 直落 DB**（`prisma db execute`），同样**没有 migration 文件 / 账本项**。

## 当前安全态（已由本次处理达成）

- `schema.prisma` 已手动补齐 Recipe 8 列 + 索引 → **`prisma migrate diff --from-schema … --to-config-datasource` 输出空**（schema↔DB 一致）。
- `prisma generate` 已重生成 client；`prisma migrate status` = “up to date”；app 正常（client↔DB 对齐）。
- ✅ 可正常用 `prisma db push`（增量改动，schema 已对齐，不会再要删数据）。
- ❌ 仍不能用 `prisma migrate dev`（shadow 漂移检测会因账本孤儿 + raw-SQL 列要 reset）。

## 恢复步骤（需你 / Codex 在仓库层做）

1. 从 Mac / Codex 那台机找回原始文件 `prisma/migrations/20260531090000_prompt_core_recipe_assets/migration.sql`，commit 进 git（内容应等于下方 Recipe SQL）。
2. 为本次 `sourceSurface` 补一个正式 migration 文件（内容=下方 sourceSurface SQL），并 `prisma migrate resolve --applied <新目录名>` 把账本补上（因列已在 DB，用 resolve 标记已应用、不重复执行）。
3. 之后 `prisma migrate dev` 应恢复正常。若 resolve 报 checksum 不符，则以找回的原始文件为准。

## 精确 SQL（参考 / 重建用）

### A. Recipe（孤儿 migration 实际内容，来自 `migrate diff` 读取 DB）

```sql
ALTER TABLE "public"."Recipe" ADD COLUMN "coverGenerationId" TEXT,
ADD COLUMN "coverImageUrl" TEXT,
ADD COLUMN "favoriteCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "remixSourceRecipeId" TEXT,
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';
CREATE INDEX "Recipe_visibility_isDeleted_createdAt_idx" ON "public"."Recipe"("visibility" ASC, "isDeleted" ASC, "createdAt" DESC);
```

### B. sourceSurface（本次已 raw SQL 落库的内容）

```sql
CREATE TYPE "GenerationSourceSurface" AS ENUM ('IMAGE_STUDIO', 'LORA_WORKBENCH', 'CANVAS', 'EDIT');
ALTER TABLE "Generation" ADD COLUMN "sourceSurface" "GenerationSourceSurface" NOT NULL DEFAULT 'IMAGE_STUDIO';
ALTER TABLE "Generation" ADD COLUMN "loraLineage" JSONB;
CREATE INDEX "Generation_userId_sourceSurface_createdAt_idx" ON "Generation" ("userId", "sourceSurface", "createdAt" DESC);
```

## 流程教训

- Codex / 另一台机跑 `migrate dev` 后**必须 commit 生成的 migration 文件**，否则 prod DB 与 git 历史脱节（本次根因）。
- 双机开发时，换机先 `git pull` 再做 schema 工作。
