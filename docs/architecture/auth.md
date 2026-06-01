# Auth and Permission Architecture

最后更新：2026-06-02

本文档记录当前 Clerk 认证、用户映射、API 认证、内部回调签名和资源归属事实。它不定义新的权限策略。

任何权限策略变更都必须先问 owner 确认。

## Current State

### Clerk Dependencies

Current auth-related packages in `package.json` include:

- `@clerk/nextjs`
- `@clerk/localizations`
- `svix`

`svix` is used by the Clerk webhook route for signature verification.

### Clerk Provider

`src/app/[locale]/layout.tsx` wraps the locale app with `ClerkProvider`.

Current provider responsibilities:

- locale-aware Clerk localization through `CLERK_LOCALIZATIONS`
- locale-aware sign-in URL
- locale-aware sign-up URL
- Studio fallback redirect after sign-in/sign-up
- allowed redirect origins through `getClerkAllowedOrigins`

### Middleware Boundary

`src/proxy.ts` combines Clerk middleware and next-intl middleware.

Current middleware behavior:

- API routes skip i18n handling.
- Non-API routes go through next-intl routing.
- In production, non-public routes call `auth.protect()`.
- In development, middleware-level `auth.protect()` is skipped.
- API routes in production are protected unless listed as public or explicitly treated as public user APIs.

Public locale routes currently include:

- locale homepage
- gallery and gallery detail paths
- sign-in
- sign-up
- creator profile paths

Public or Clerk-bypassed API routes currently include:

- `/api/images`
- `/api/voices`
- `/api/voices/(.*)`
- `/api/webhooks/clerk`
- `/api/health`
- `/api/health/providers`
- `/api/internal/civitai-lora/prewarm`
- `/api/internal/execution/callback`
- `/api/internal/execution/resolve-key`
- `/api/internal/execution/long-video/advance`
- `/api/internal/fal/webhook`

`/api/users/:username` is public, while `/api/users/me/*` requires auth.

### API Route Factories

`src/lib/api-route-factory.ts` provides shared route factories.

Current user-facing factories:

- `createApiRoute`
- `createApiGetRoute`
- `createApiGetByIdRoute`
- `createApiPutRoute`
- `createApiPostByIdRoute`
- `createApiPatchByIdRoute`
- `createApiDeleteRoute`

These factories centralize:

- Clerk auth lookup through `auth()`
- optional or required auth for GET routes
- user-scoped rate limiting when configured
- JSON parsing
- Zod validation
- standard error response handling
- Sentry capture for unhandled errors

Current internal factory:

- `createApiInternalRoute`

It does not perform Clerk auth. It reads the raw body, verifies a caller-provided signature, parses JSON, validates with Zod, and calls the internal handler.

### Mixed Route Auth Style

The codebase currently has both patterns:

- API routes using `src/lib/api-route-factory.ts`
- API routes directly calling `auth()` from `@clerk/nextjs/server`

This is current fact, not a target decision.

Changing route auth style or route factory coverage is a permission/architecture decision and requires owner confirmation if it changes behavior.

### User Mapping

`User.clerkId` in `prisma/schema.prisma` stores the external Clerk user ID.

`src/services/user.service.ts` owns current user mapping:

- `getUserByClerkId`
- `ensureUser`
- `createUser`
- `syncUserFromClerk`
- `softDeleteUser`
- `refreshAvatarFromClerk`

`ensureUser(clerkId)` performs just-in-time DB user provisioning:

- find existing DB user by `clerkId`
- sync missing username/displayName/avatar from Clerk
- create DB user if missing

Most service-layer functions receive Clerk ID from route handlers, then resolve the internal DB `User.id` through `ensureUser`.

### Clerk Webhook

`src/app/api/webhooks/clerk/route.ts` handles Clerk webhook events.

Current webhook behavior:

- requires `CLERK_WEBHOOK_SECRET`
- verifies `svix-id`, `svix-timestamp`, and `svix-signature`
- rejects stale webhook timestamps older than 5 minutes
- handles `user.created`
- handles `user.updated`
- handles `user.deleted`
- ignores other Clerk event types with logging

Webhook route is Clerk-bypassed at middleware because it authenticates with Svix signature headers.

### Ownership and Resource Authorization

Authentication answers who the requester is. Resource authorization is handled separately in services and route handlers.

Current ownership patterns include:

- checking `generation.userId === user.id` before owner-only generation reads/deletes
- scoping per-user resources by internal DB `userId`
- using `ownedBy(userId)` and `ownedByClerk(clerkId)` helpers in `src/lib/db-scope.ts`
- public profile routes reading optional viewer identity for viewer-specific state
- admin routes checking `isAdmin(clerkId)`

The client must not be trusted for:

- user ID
- ownership
- permission
- credit/allowance state
- generation status

### Admin Boundary

Admin access currently uses `src/lib/admin.ts`.

`isAdmin(clerkId)` checks whether the Clerk user ID is listed in `ADMIN_USER_IDS`.

Current admin routes include:

- `/api/admin/free-tier-stats`
- `/api/admin/models`
- `/api/admin/models/[modelId]`
- `/api/models/health` POST refresh path

The current admin model is environment-variable based. It does not use Clerk organization roles, Clerk metadata, or a DB role table.

### Internal and Machine Auth

Internal worker and webhook routes bypass Clerk middleware and must authenticate themselves.

Current mechanisms:

- internal execution routes use HMAC-SHA256 through `verifyInternalExecutionSignature`
- FAL webhook uses Ed25519 signature verification through `verifyFalWebhookSignature`
- Civitai LoRA prewarm uses `Authorization: Bearer ${CRON_SECRET}`
- Clerk webhook uses Svix verification through `svix`

Internal execution routes currently include:

- `/api/internal/execution/callback`
- `/api/internal/execution/resolve-key`
- `/api/internal/execution/long-video/advance`

FAL webhook route:

- `/api/internal/fal/webhook`

Civitai prewarm route:

- `/api/internal/civitai-lora/prewarm`

## Permission Change Guard

These changes must stop and ask owner before writing code or updating policy as target architecture:

- changing which pages are public or protected
- changing which API routes are public, optional-auth, required-auth, or internal-only
- changing development vs production auth behavior
- changing Clerk provider redirect rules
- changing public gallery, creator profile, profile privacy, asset visibility, or prompt visibility rules
- changing admin identity from `ADMIN_USER_IDS` to Clerk roles, Clerk metadata, organizations, or DB roles
- changing internal route bypass rules
- changing internal HMAC, FAL webhook, cron secret, or Clerk webhook verification rules
- changing DB user provisioning behavior
- changing ownership checks for generations, projects, cards, LoRA, API keys, node workflows, or media
- changing private media access strategy

## Non-Goals

- Do not define a new role system in this document.
- Do not move routes between public and protected status in this document.
- Do not change admin authorization in this document.
- Do not infer Clerk platform behavior from memory.
- Do not make private media access decisions here; see `docs/architecture/storage.md`.

## Unresolved

- Whether all API routes should eventually use `src/lib/api-route-factory.ts` is unresolved.
- Current route auth style is mixed: some routes use factories and some call `auth()` directly.
- Middleware skips `auth.protect()` in development; whether that should remain the long-term development behavior is unresolved.
- Admin authorization is currently based on `ADMIN_USER_IDS`; any move to Clerk metadata, organizations, or DB roles requires owner confirmation.
- Private media access is unresolved and belongs with storage/media architecture.
- A full route-by-route permission audit has not been performed in this pass.
- Official Clerk documentation was not checked in this pass because this document only records current code facts.

## Source of Truth

- User-confirmed auth documentation boundary in the 2026-06-02 documentation redesign discussion.
- `package.json`
- `src/app/[locale]/layout.tsx`
- `src/proxy.ts`
- `src/lib/api-route-factory.ts`
- `src/lib/admin.ts`
- `src/lib/db-scope.ts`
- `src/lib/signature-verifiers/internal-execution.ts`
- `src/lib/signature-verifiers/fal-webhook.ts`
- `src/app/api/webhooks/clerk/route.ts`
- `src/app/api/internal/civitai-lora/prewarm/route.ts`
- `src/app/api/internal/execution/callback/route.ts`
- `src/app/api/internal/execution/resolve-key/route.ts`
- `src/app/api/internal/execution/long-video/advance/route.ts`
- `src/app/api/internal/fal/webhook/route.ts`
- `src/app/api/users/[username]/route.ts`
- `src/app/api/download/route.ts`
- `src/app/api/image/proxy/route.ts`
- `src/app/api/admin/free-tier-stats/route.ts`
- `src/app/api/admin/models/route.ts`
- `src/app/api/admin/models/[modelId]/route.ts`
- `src/services/user.service.ts`
- `src/services/apiKey.service.ts`
- `prisma/schema.prisma`

## Last Verified

- Date: 2026-06-02
- Method: owner boundary confirmation plus code inspection
- External docs: not checked; Clerk official docs intentionally deferred until auth behavior changes
- Runtime validation: not run
