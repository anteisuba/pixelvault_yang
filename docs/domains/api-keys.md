# API Keys Domain

最后更新：2026-06-02

本文档记录 API Keys / BYOK 业务域的当前事实、已确认目标和未决边界。它不替代 Generation、Provider、Credits、Auth 或 Storage 文档。

## Current

### Role

当前 API Keys 域已经承担用户自带 provider key 的管理入口。

Current implemented responsibilities include:

- list saved user API keys
- create or update an encrypted API key record
- activate or deactivate a saved key through `isActive`
- display masked key metadata in UI
- trigger a server-side verification probe
- expose saved keys to Studio route selection UI
- decrypt a key server-side for trusted generation or worker execution

当前代码已经把明文 key 留在服务端路径内。客户端列表接口返回的是 `maskedKey` 和元数据，不返回 `encryptedKey` 或明文 key。

### Data Model

`UserApiKey` is the current database source of truth.

Current fields include:

- `id`
- `userId`
- `modelId`
- `adapterType`
- `providerConfig`
- `label`
- `encryptedKey`
- `maskedKey`
- `isActive`
- `createdAt`
- `updatedAt`

Current uniqueness is:

```text
userId + adapterType + modelId
```

Current hot paths are indexed for:

- list keys by user, newest first
- find the newest active key for a user and adapter

Current model does not have durable fields for:

- `verificationStatus`
- `lastVerifiedAt`
- `verificationErrorCode`
- `lastUsedAt`
- `status`
- `deletedAt`

### Encryption And Masking

Current key storage uses `encryptApiKey` / `decryptApiKey`.

The current encryption implementation:

- is server-only
- uses AES-256-GCM
- depends on `API_KEY_ENCRYPTION_SECRET`
- stores encrypted payload as `iv:authTag:ciphertext`

`maskKey` derives a display-only masked value from the plaintext key at create/update time. Legacy rows with `maskedKey = "****"` are lazily backfilled by decrypting once on list.

Masked keys are display metadata only. They are not usable provider credentials.

### API Surface

Current user-facing API key routes:

- `GET /api/api-keys`
- `POST /api/api-keys`
- `PUT /api/api-keys/[id]`
- `DELETE /api/api-keys/[id]`
- `POST /api/api-keys/[id]/verify`

Current internal execution route:

- `POST /api/internal/execution/resolve-key`

The user-facing routes are authenticated and call service-layer functions. The internal execution route is intended for trusted worker execution and verifies an internal execution signature before resolving a platform key or BYOK key.

### Client Surface

Current client-facing API key code includes:

- API client helpers in `src/lib/api-client/api-keys.ts`
- state and action hook in `src/hooks/use-api-keys.ts`
- context in `src/contexts/api-keys-context.tsx`
- manager, form, row, drawer, and health-dot components under `src/components/business/`
- Studio route selection surfaces that can pass `apiKeyId` into generation request payloads

The client can express a key selection intent through `apiKeyId`. The client does not decide final provider execution.

### Verification

Current verification exists as a server action path:

- `verifyApiKey` checks key ownership
- decrypts the stored key server-side
- calls an adapter-specific `verifyAdapterKey`
- returns `available`, `no_key`, or `failed`

Current UI health state uses:

```text
available | no_key | failed | unknown
```

`useApiKeys` stores health state in a local 5-minute `localStorage` cache. Newly created keys and key-value updates are auto-verified from the client hook after save.

Important current limitation:

Verification results are not persisted to `UserApiKey`. They do not update a durable `verificationStatus`, `lastVerifiedAt`, or failure reason field.

The current adapter-specific verification probes have not been checked against current official provider documentation in this documentation pass.

### Key Resolution

Current image generation route resolution already follows the main BYOK priority:

1. If the request includes `apiKeyId`, the server resolves that saved key for the authenticated user.
2. If the key is missing, inactive, owned by another user, or adapter-incompatible, the request fails.
3. If no explicit key is provided, the server finds the newest active key for the model adapter.
4. If no matching user key exists and the model supports free tier, the server reserves a free-tier slot and uses a platform key.
5. If no key path exists, the request fails and asks the user to bind an API key.

`src/services/image/generate-image.service.ts` owns this route resolution for the current image path.

`src/services/api-key-resolver.service.ts` owns internal worker key resolution. It resolves BYOK through `apiKeyId + job.userId`, or platform key through a signed `useSystemKey` path that must match the job adapter.

### Delete And Disable

Current user-visible disable behavior is `isActive = false`.

Current `deleteApiKey` hard deletes the `UserApiKey` row after ownership check.

This is a current fact, not the target direction.

### Platform Keys

Platform keys are read from server environment through `getSystemApiKey`.

They are currently server-owned infrastructure credentials and are not exposed to client code.

## Target

### Role

API Keys domain owns user-provided API key lifecycle and user selection intent.

It owns:

- binding
- validation
- encrypted storage
- masking for display
- active / inactive state
- deletion or disable behavior
- user selection intent, such as explicit `apiKeyId`
- server-side ownership checks for key access

It does not own:

- provider request payload construction
- provider execution
- model capability decisions
- model-to-provider routing
- free-tier / platform-key eligibility
- usage, allowance, or credit deduction
- fallback from BYOK to platform key

Key boundary:

```text
API Keys tells the system which keys exist, what state they are in, and whether the user explicitly selected one.
Generation / provider services decide final execution based on model, adapter, free tier, BYOK priority, and usage policy.
```

Client-side key selection is only user intent. Final key resolution must happen on the server.

### BYOK / Platform Key Resolution Contract

BYOK and platform key resolution priority is a hard contract:

1. If the user explicitly selects `apiKeyId`, the system must use that BYOK key.
2. If the selected key is unavailable, inactive, deleted, owned by another user, or incompatible with the target provider/adapter, the request must fail loudly.
3. The system must not silently fall back from an explicit BYOK key to a platform key.
4. If the user does not explicitly select a key but has an active BYOK key for the required provider/adapter, the system should automatically use the user's BYOK key.
5. If no matching BYOK key exists and the model supports free tier, the system may use the platform key.
6. If no matching BYOK key exists and the model does not support free tier, the UI/API should prompt the user to bind an API key.

Explicit user intent has priority over convenience fallback.

BYOK key failure and provider execution failure must not be hidden by retrying with a platform key unless the user explicitly starts a new request without that failed `apiKeyId`.

### Validation Policy

Target key validation policy:

1. If the provider has a reliable validation method and validation fails, block saving.
2. If validation cannot be completed because of temporary infrastructure issues, allow saving only as `inactive` or `unverified`.
3. If a provider has no safe and reliable lightweight validation method, allow saving as `unverified`, but do not treat it as automatically usable until a real generation succeeds or an explicit verification flow succeeds.
4. `unverified` or `inactive` keys must not participate in automatic BYOK routing.
5. Automatic BYOK routing may only use keys that are owned by the user, provider/adapter compatible, active, and verified or explicitly marked usable by a provider-specific rule.
6. A failed validation must never cause fallback to platform key during the same explicit BYOK flow.

Target durable status model:

```text
verificationStatus:
  verified
  unverified
  failed

isActive:
  true / false

lastVerifiedAt:
  Date | null

verificationErrorCode:
  string | null
```

Provider-specific verification behavior must be checked against current official provider documentation before implementation. Do not guess a validation endpoint from provider URL shape or model API behavior.

### Verification UX

API Keys domain should provide an explicit "verify key" action.

Verification result should be visible in UI:

- green: verified / usable
- red: failed / unusable
- neutral: unverified, not checked, or temporarily unknown

Verification must run server-side. UI only displays verification result and must not call providers directly.

Verification should update:

- `verificationStatus`
- `lastVerifiedAt`
- optional safe `verificationErrorCode`

Failed or unverified keys must not participate in automatic BYOK routing unless a provider-specific rule explicitly allows it.

Color is only UI expression. Business logic must use server-side status, ownership, compatibility, and provider-specific rules.

### Visibility And Secret Handling

Key visibility policy:

- UI must never receive plaintext API keys.
- Public/client-facing API responses must never return plaintext API keys.
- Public/client-facing API responses may return only safe metadata:
  - `id`
  - `provider` / `adapter`
  - display name
  - masked key
  - active state
  - verification status
  - `createdAt` / `updatedAt` / `lastUsedAt`
  - optional safe failure reason code
- The full encrypted key may only be read and decrypted server-side inside trusted service, route, or worker execution paths.
- Logs must never include plaintext keys, decrypted keys, encrypted key ciphertext, full `Authorization` headers, or provider credential payloads.
- Masked key is display-only and must never be used to reconstruct or call provider APIs.

### Security Hard Rules

- API keys may only be decrypted server-side.
- Client code must never receive plaintext API keys.
- Client code must never reconstruct provider credentials from masked keys.
- Provider requests must only be constructed in trusted server/service/worker layers.
- UI components and client hooks must not call providers directly.
- API Keys domain must not expose provider execution helpers to the client.
- Logs must never include plaintext keys, decrypted keys, encrypted key ciphertext, full `Authorization` headers, or provider credential payloads.
- Error responses must not leak key material or provider credential details.
- API key ownership must be checked server-side before read, update, delete, verify, or use.
- A user-controlled `apiKeyId` must never be trusted without ownership and compatibility checks.
- Environment platform keys must never be exposed through `NEXT_PUBLIC_*`.

### Delete And Disable Policy

Target user-facing "delete" should disable or revoke the key record by default.

Rules:

- Disabled or revoked keys must not participate in automatic routing.
- Disabled or revoked keys must not be usable for new explicit `apiKeyId` requests.
- Historical generation, job, or usage records may keep non-secret references for audit and debugging.
- Historical records must never keep plaintext API keys.

Historical records may keep:

- `apiKeyId`, if the record still exists
- provider / adapter
- masked key snapshot
- key display name snapshot
- verification status at use time
- `source = byok`

Historical records must not keep:

- plaintext key
- decrypted key
- full `Authorization` header
- provider credential payload

Hard delete is allowed only when it does not break auditability and after secret material is already irrecoverable.

Target record lifecycle:

```text
status:
  active
  inactive
  revoked
  deleted

deletedAt:
  Date | null
```

If the product later supports a user request to fully remove secret material, prefer deleting the encrypted secret while retaining a non-secret tombstone or audit record.

### Platform Key / BYOK Boundary

Platform keys are owner-controlled infrastructure.

Platform keys may be used only for:

- free-tier / platform allowance flows
- internal testing or admin flows
- explicitly owner-approved system operations

Platform keys must not be treated as a generic backup for failed user BYOK.

If the user explicitly selected BYOK `apiKeyId`, any validation, compatibility, auth, quota, provider, or execution failure must fail that request.

If the system auto-selected an active matching BYOK key, BYOK failure should also fail loudly by default. The system should not hide user-key failure by consuming platform allowance unless the product later adds an explicit fallback setting.

## Unresolved

- Current `UserApiKey` has no durable `verificationStatus`, `lastVerifiedAt`, `verificationErrorCode`, `lastUsedAt`, `status`, or `deletedAt`.
- Current verification health is client-local and temporary. It is not a durable routing source of truth.
- Current `ApiKeyHealthStatus` values are `available | no_key | failed | unknown`; target durable status values should be `verified | unverified | failed`.
- Current create/update flow saves the key first and verifies after save from the client hook. Target policy may need save-time validation before storing a key when a reliable provider validation method exists.
- Current automatic BYOK routing uses `isActive` and adapter compatibility. It does not yet require durable verified status.
- Current user-facing delete hard deletes `UserApiKey`; target is soft disable/revoke with optional non-secret tombstone.
- Current adapter-specific verification probes have not been validated against current official provider docs. They must not be expanded or made authoritative until official docs are checked.
- Whether failed verification should set `isActive = false` automatically, or only set `verificationStatus = failed`, needs product confirmation before implementation.
- Whether a real generation success should automatically promote an `unverified` key to `verified` needs implementation design.
- Whether custom `providerConfig.baseUrl` should be allowed for every adapter, or limited per adapter/provider, needs a security review before expanding custom provider support.
- Internal worker key resolution returns plaintext credentials to trusted worker code. Any worker boundary, signature, queue, or log change must re-audit this path.
- Video, audio, 3D, long-video, and node workflow BYOK behavior should be audited against this contract before relying on image-route behavior as universal.

## Source of Truth

- User-confirmed API Keys / BYOK direction in the 2026-06-02 documentation redesign discussion.
- `docs/architecture/generation.md`
- `docs/architecture/credits.md`
- `docs/architecture/auth.md`
- `prisma/schema.prisma`
- `src/constants/api-keys.ts`
- `src/constants/providers.ts`
- `src/lib/crypto.ts`
- `src/lib/platform-keys.ts`
- `src/lib/validate-api-key.ts`
- `src/lib/api-client/api-keys.ts`
- `src/contexts/api-keys-context.tsx`
- `src/hooks/use-api-keys.ts`
- `src/hooks/use-image-model-options.ts`
- `src/hooks/use-split-model-options.ts`
- `src/components/business/ApiKeyManager.tsx`
- `src/components/business/ApiKeyForm.tsx`
- `src/components/business/ApiKeyRow.tsx`
- `src/components/business/ApiKeyDrawerTrigger.tsx`
- `src/components/business/ApiKeyHealthDot.tsx`
- `src/components/business/studio/StudioQuickRouteSelector.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/services/apiKey.service.ts`
- `src/services/api-key-resolver.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/app/api/api-keys/route.ts`
- `src/app/api/api-keys/[id]/route.ts`
- `src/app/api/api-keys/[id]/verify/route.ts`
- `src/app/api/internal/execution/resolve-key/route.ts`
- `src/types/index.ts`

## Last Verified

- Date: 2026-06-02
- Method: owner direction confirmation plus schema/API route/service/hook/component/generation-route/internal-worker key resolution inspection
- External docs: not checked in this pass; provider-specific verification behavior still requires official documentation review
- Runtime: not run
