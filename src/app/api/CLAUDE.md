# src/app/api/ — API Routes

## Rules

API Routes do exactly THREE things, in order:

1. **Auth** — 默认由 `src/lib/api-route-factory.ts` 的工厂内置 Clerk `auth()`；内部回调走 `createApiInternalRoute` 签名校验
2. **Validate** — Parse request body with Zod schema from `@/types/`
3. **Delegate** — Call the appropriate function from `@/services/`

## Forbidden

- No business logic in route handlers
- No direct Prisma queries
- No AI provider calls
- No R2 uploads
- No credit calculations

## Response Format

Always return consistent JSON:

```ts
// Success
NextResponse.json({ success: true, data: { ... } })

// Error
NextResponse.json({ success: false, error: 'message', errorCode?, i18nKey? }, { status: 4xx })
```

## Adding a New Route

1. Create `src/app/api/<name>/route.ts`, using an `api-route-factory.ts` factory by default; hand-write `auth()` only where no factory fits (streaming / multipart)
2. Import Zod schema from `@/types/`
3. Import service function from `@/services/`
4. Add the endpoint constant to `@/constants/config.ts`
5. Add the client-side wrapper to `@/lib/api-client/<domain>.ts` (new files get an `export *` line in `@/lib/api-client.ts`)
