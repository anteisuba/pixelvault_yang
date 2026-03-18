# src/services/ — Server-Only Business Logic

## Rules

1. Every file here must import `'server-only'` at the top
2. Services are the ONLY layer that touches the database (Prisma) or external APIs (AI providers, R2)
3. API Routes must NOT contain business logic — they call services
4. Credit deduction logic MUST live here, never trust client-side values
5. All functions should accept typed inputs and return typed outputs (no `any`)

## Key Files

- `generation.service.ts` — Create, query, toggle visibility of generations
- `user.service.ts` — User CRUD, credit operations
- `usage.service.ts` — Aggregated usage stats for Profile page
- `storage/r2.ts` — Cloudflare R2 upload (fetchAsBuffer, uploadToR2, generateStorageKey)

## Adding a New Service

1. Create `<name>.service.ts`
2. Import `'server-only'` as first line
3. Import Prisma from `@/lib/db`
4. Define input/output types (prefer Zod schemas in `@/types/`)
5. Export named functions (not a class)
