# prisma/ — Database Schema

## Rules

1. After ANY change to `schema.prisma`, run:
   ```bash
   npx prisma migrate dev --name <description>
   npx prisma generate
   ```
2. NEVER manually edit files in `src/lib/generated/prisma/` — they are auto-generated
3. Always add appropriate `@@index()` for fields used in WHERE/ORDER BY
4. Use `@db.Text` for user-generated content fields (prompt, error messages)
5. Prefer `onDelete: Cascade` for ownership relations, `onDelete: SetNull` for soft references

## Schema Reference

See `docs/database/database.md` for full model documentation.

## Naming Conventions

- Models: PascalCase (`UserApiKey`, `ApiUsageLedger`)
- Fields: camelCase (`createdAt`, `isPublic`)
- Enums: PascalCase with SCREAMING_SNAKE values (`GenerationStatus.COMPLETED`)
