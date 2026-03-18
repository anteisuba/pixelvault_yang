# src/app/api/ — API Routes

## Rules

API Routes do exactly THREE things, in order:

1. **Auth** — `auth()` from Clerk, reject if unauthorized
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
NextResponse.json({ success: false, error: 'message' }, { status: 4xx })
```

## Adding a New Route

1. Create `src/app/api/<name>/route.ts`
2. Import `auth` from Clerk
3. Import Zod schema from `@/types/`
4. Import service function from `@/services/`
5. Add the endpoint constant to `@/constants/config.ts`
6. Add the client-side wrapper to `@/lib/api-client.ts`
