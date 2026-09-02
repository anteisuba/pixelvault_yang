# prisma/ — Database Schema

## Rules

1. **改完 `schema.prisma` 先只生成、不应用**：

   ```bash
   npx prisma migrate dev --create-only --name <description>
   ```

   ⛔ **禁止裸跑 `npx prisma migrate dev`** —— 它生成并**立即应用**，而本仓
   `.env.local` 指向的就是 Vercel 用的那个生产库（2026-08-22 由构建日志确认，见
   `docs/references/cicd.md`）。裸跑一次 = 迁移直接打到生产上，没有中间地带、没有
   第二次机会。

   生成之后读一遍 `prisma/migrations/<新目录>/migration.sql`，别只看 schema diff。
   **给已存在的表加约束**（唯一索引 / `SET NOT NULL` / 外键 / 改列类型 / 加无默认值
   的非空列）时，先确认它在**现有数据**上成立：简单的自己查一条只读 SQL（唯一 →
   `GROUP BY … HAVING count(*)>1`；非空 → `count(*) WHERE col IS NULL`），复杂的
   （`USING (CASE …)` 转换、多条迁移互相依赖）跑 `npm run preflight:migrations` 在
   生产的 Neon 分支副本上真跑一遍。然后把**怎么验的**登记进
   `prisma/migration-safety.test.ts` 的 `ACKNOWLEDGED` —— 那道闸进 pre-push，不登记
   push 不出去。

   ⚠ **CI 挡不住这类问题**：`ci.yml` 是在**空库**上重放迁移历史，没有存量数据，约束
   怎么都建得上。绿色的 CI 在这里不构成证据。

   确认无误再应用：

   ```bash
   npx prisma migrate dev   # 不带 --create-only，应用刚才生成的那份
   npx prisma generate
   ```

2. NEVER manually edit files in `src/lib/generated/prisma/` — they are auto-generated
3. Always add appropriate `@@index()` for fields used in WHERE/ORDER BY
4. Use `@db.Text` for user-generated content fields (prompt, error messages)
5. Prefer `onDelete: Cascade` for ownership relations, `onDelete: SetNull` for soft references

## Schema Reference

Models are defined in `prisma/schema.prisma` (the source of truth). 域模型地图（38 模型 + 12 枚举）、迁移纪律与高风险模型见 [`docs/references/database.md`](../docs/references/database.md)；分层与 service 边界（谁能碰 Prisma）见 [`docs/references/backend.md`](../docs/references/backend.md)。

## Naming Conventions

- Models: PascalCase (`UserApiKey`, `ApiUsageLedger`)
- Fields: camelCase (`createdAt`, `isPublic`)
- Enums: PascalCase with SCREAMING_SNAKE values (`GenerationStatus.COMPLETED`)
