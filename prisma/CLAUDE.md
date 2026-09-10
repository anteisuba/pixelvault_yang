# prisma/ — Database Schema

## Rules

1. Schema、存量数据和操作授权遵循 [数据库场景](../docs/scenes/db-migration.md)。先核实目标连接；禁止对生产或未确认隔离环境运行 `migrate dev`（含 `--create-only`）。迁移例外须获 owner 针对本任务授权；不要根据旧流程自动生成或应用。约束型变更须有存量数据证据并登记现有 migration-safety 闸门。

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
