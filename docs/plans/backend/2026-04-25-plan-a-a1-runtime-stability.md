# Plan A — A.1 Runtime Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 来源规划: [tech-debt-and-creative-control-roadmap](../product/tech-debt-and-creative-control-roadmap.md)

**Goal:** Fix three P0/P1 runtime reliability gaps: DB transaction atomicity on execution-callback finalize, free-tier slot-reservation atomicity, and HMAC signature-verifier deduplication.

**Architecture:**
- A.1.3 (signature extractor) goes first — it de-risks A.1.1's test expansion by giving a shared util to import.
- A.1.1 (transaction) is a surgical edit to `execution-callback.service.ts` — wrap three already-client-aware DB calls in `db.$transaction`.
- A.1.2 (free-tier) introduces one new Prisma model (`FreeTierSlot`) and a serializable transaction to atomically reserve daily slots.

**Tech Stack:** Prisma 7 (interactive transactions + isolationLevel), Node crypto (HMAC), Vitest, TypeScript

---

## Context: Dependency Map

Before touching these files, run:
```bash
grep -r "execution-callback.service" src/ --include="*.ts" -l
grep -r "signature-verifiers" src/ --include="*.ts" -l
grep -r "freeTierSlot\|FreeTierSlot" src/ --include="*.ts" -l
```

Expected: no existing dependents on `signature-verifiers/` (it's new). `execution-callback.service` is only imported by `callback/route.ts` and its test.

---

## Task 1: Extract HMAC Signature Verifier

**Files:**
- Create: `src/lib/signature-verifiers/internal-execution.ts`
- Create: `src/lib/signature-verifiers/internal-execution.test.ts`
- Modify: `src/app/api/internal/execution/callback/route.ts`
- Modify: `src/app/api/internal/execution/resolve-key/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/signature-verifiers/internal-execution.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

// Set secret before importing module under test
const TEST_SECRET = 'test-secret-32-characters-minimum'

vi.stubEnv('INTERNAL_CALLBACK_SECRET', TEST_SECRET)

import {
  verifyInternalExecutionSignature,
  signPayload,
} from './internal-execution'

function makeRequest(body: string, signature: string): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    body,
    headers: { 'X-Execution-Signature': signature },
  })
}

function validSignature(body: string): string {
  return createHmac('sha256', TEST_SECRET).update(body, 'utf8').digest('hex')
}

describe('signPayload', () => {
  it('produces a 64-char hex HMAC-SHA256 string', () => {
    const sig = signPayload('hello', TEST_SECRET)
    expect(sig).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(sig)).toBe(true)
  })

  it('matches what verifyInternalExecutionSignature accepts', () => {
    const body = '{"runId":"job-1"}'
    const sig = signPayload(body, TEST_SECRET)
    const req = makeRequest(body, sig)
    expect(() => verifyInternalExecutionSignature(body, req)).not.toThrow()
  })
})

describe('verifyInternalExecutionSignature', () => {
  it('accepts a valid HMAC signature', () => {
    const body = '{"runId":"job-1","kind":"result"}'
    const sig = validSignature(body)
    const req = makeRequest(body, sig)
    expect(() => verifyInternalExecutionSignature(body, req)).not.toThrow()
  })

  it('throws 401 on forged signature', () => {
    const body = '{"runId":"job-1"}'
    const req = makeRequest(body, 'a'.repeat(64))
    expect(() => verifyInternalExecutionSignature(body, req)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    )
  })

  it('throws 401 on missing X-Execution-Signature header', () => {
    const req = new Request('http://localhost/test', {
      method: 'POST',
      body: '{}',
    })
    expect(() => verifyInternalExecutionSignature('{}', req)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    )
  })

  it('throws 401 on signature wrong length (not 64 hex chars)', () => {
    const req = makeRequest('{}', 'abc123')
    expect(() => verifyInternalExecutionSignature('{}', req)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    )
  })

  it('throws 500 when INTERNAL_CALLBACK_SECRET is not set', () => {
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', '')
    const req = makeRequest('{}', 'a'.repeat(64))
    expect(() => verifyInternalExecutionSignature('{}', req)).toThrow(
      expect.objectContaining({ statusCode: 500 }),
    )
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', TEST_SECRET)
  })

  it('is timing-safe: equal-length wrong signature throws 401, not short-circuit', () => {
    const body = '{"runId":"job-1"}'
    const wrongSig = '0'.repeat(64)
    const req = makeRequest(body, wrongSig)
    expect(() => verifyInternalExecutionSignature(body, req)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/signature-verifiers/internal-execution.test.ts --reporter=verbose
```

Expected: `FAIL — Cannot find module './internal-execution'`

- [ ] **Step 3: Implement the shared verifier**

Create `src/lib/signature-verifiers/internal-execution.ts`:

```ts
import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { EXECUTION_INTERNAL } from '@/constants/execution'
import { ApiRequestError } from '@/lib/errors'

function getSecret(): string {
  const secret = process.env.INTERNAL_CALLBACK_SECRET
  if (!secret) {
    throw new ApiRequestError(
      'INTERNAL_CALLBACK_SECRET_MISSING',
      500,
      'errors.common.unexpected',
      'Internal callback secret is not configured.',
    )
  }
  return secret
}

function parseHex(signature: string | null): Buffer | null {
  if (!signature) return null
  const normalized = signature.trim().toLowerCase()
  if (
    normalized.length !== EXECUTION_INTERNAL.SIGNATURE_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    return null
  }
  return Buffer.from(normalized, 'hex')
}

/** Sign a string payload with the internal callback secret. */
export function signPayload(body: string, secret: string): string {
  return createHmac(EXECUTION_INTERNAL.SIGNATURE_ALGORITHM, secret)
    .update(body, 'utf8')
    .digest('hex')
}

/**
 * Verify that the incoming request carries a valid HMAC-SHA256 signature.
 * Throws ApiRequestError on any failure (401 for bad sig, 500 for missing secret).
 */
export function verifyInternalExecutionSignature(
  rawBody: string,
  request: Request,
): void {
  const receivedSig = parseHex(
    request.headers.get(EXECUTION_INTERNAL.SIGNATURE_HEADER),
  )
  if (!receivedSig) {
    throw new ApiRequestError(
      'INVALID_EXECUTION_SIGNATURE',
      401,
      'errors.auth.unauthorized',
      'Invalid execution signature.',
    )
  }

  const expectedSig = Buffer.from(
    signPayload(rawBody, getSecret()),
    'hex',
  )

  if (
    receivedSig.length !== expectedSig.length ||
    !timingSafeEqual(receivedSig, expectedSig)
  ) {
    throw new ApiRequestError(
      'INVALID_EXECUTION_SIGNATURE',
      401,
      'errors.auth.unauthorized',
      'Invalid execution signature.',
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/signature-verifiers/internal-execution.test.ts --reporter=verbose
```

Expected: 7 tests PASS

- [ ] **Step 5: Update callback route to use shared verifier**

Edit `src/app/api/internal/execution/callback/route.ts` — replace the three local functions with the shared import:

```ts
import 'server-only'

import { createApiInternalRoute } from '@/lib/api-route-factory'
import { verifyInternalExecutionSignature } from '@/lib/signature-verifiers/internal-execution'
import { ExecutionCallbackPayloadSchema } from '@/types'
import {
  handleExecutionCallback,
  type CallbackResult,
} from '@/services/execution-callback.service'

export const runtime = 'nodejs'

export const POST = createApiInternalRoute<
  typeof ExecutionCallbackPayloadSchema,
  CallbackResult
>({
  schema: ExecutionCallbackPayloadSchema,
  routeName: 'POST /api/internal/execution/callback',
  verifySignature: verifyInternalExecutionSignature,
  handler: async ({ data }) => {
    return handleExecutionCallback(data)
  },
})
```

- [ ] **Step 6: Update resolve-key route to use shared verifier**

Edit `src/app/api/internal/execution/resolve-key/route.ts` — replace local `getInternalCallbackSecret`, `parseSignatureHeader`, `verifyExecutionSignature` functions with the shared import. The route body stays, only the verifier function changes:

Find the three local functions (`getInternalCallbackSecret`, `parseSignatureHeader`, `verifyExecutionSignature`) and replace with:

```ts
import { verifyInternalExecutionSignature } from '@/lib/signature-verifiers/internal-execution'
```

Then wherever `verifyExecutionSignature` is referenced in the route, change to `verifyInternalExecutionSignature`.

- [ ] **Step 7: Run all route tests to verify no regression**

```bash
npx vitest run src/app/api/internal/ --reporter=verbose
```

Expected: All existing callback and resolve-key route tests PASS

- [ ] **Step 8: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add src/lib/signature-verifiers/internal-execution.ts \
        src/lib/signature-verifiers/internal-execution.test.ts \
        src/app/api/internal/execution/callback/route.ts \
        src/app/api/internal/execution/resolve-key/route.ts
git commit -m "refactor(lib): extract HMAC verifier to shared signature-verifiers/internal-execution"
```

---

## Task 2: Wrap Execution-Callback Finalize in db.\$transaction

**Files:**
- Modify: `src/services/execution-callback.service.ts` (lines ~226–296)
- Modify: `src/services/execution-callback.service.test.ts` (add transaction-rollback cases)

**Why this matters:** `streamUploadToR2 → createGeneration → completeGenerationJob → createApiUsageEntry` — currently the last two run in `Promise.all` outside any transaction. If `createApiUsageEntry` throws, `completeGenerationJob` may have already succeeded, leaving `generationId` set on the job but no ledger entry. The audio finalize path already wraps these in `db.$transaction`; this task brings video/image parity.

**Orphan R2 risk decision:** If R2 upload succeeds but the subsequent `db.$transaction` fails, the R2 object is orphaned. Accepted as a controlled leak (P3 follow-up: nightly scan comparing `r2.listObjects('generations/')` against `Generation.storageKey`; delete objects older than 24 h with no matching Generation row).

- [ ] **Step 1: Write the failing test**

Add to `src/services/execution-callback.service.test.ts`:

```ts
describe('finalize — transaction atomicity', () => {
  it('rolls back when createApiUsageEntry fails after createGeneration succeeds', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))
    mockStreamUploadToR2.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/video.mp4',
      sizeBytes: 1024,
    })
    mockCreateGeneration.mockResolvedValue({ id: 'generation-1' })
    mockCompleteGenerationJob.mockResolvedValue({})
    mockCreateApiUsageEntry.mockRejectedValue(new Error('DB write failed'))

    const payload: ExecutionCallbackPayload = {
      runId: 'job-1',
      kind: 'result',
      ts: '2026-04-25T00:00:00.000Z',
      data: {
        artifactUrl: 'https://provider.com/video.mp4',
        mimeType: 'video/mp4',
        width: 1280,
        height: 720,
        duration: 5,
        requestCount: 1,
      },
    }

    const result = await handleExecutionCallback(payload)

    // Job should be marked FAILED (not COMPLETED)
    expect(result.action).toBe('failed')
    expect(mockFailGenerationJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ errorMessage: expect.any(String) }),
    )
    // completeGenerationJob must NOT have committed (rolled back)
    // In unit tests we verify the intent via failGenerationJob being called
    // Real DB atomicity is verified in integration tests
  })

  it('calls failGenerationJob when the entire finalize transaction throws', async () => {
    mockFindUnique.mockResolvedValue(buildJob('RUNNING'))
    mockStreamUploadToR2.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/video.mp4',
      sizeBytes: 1024,
    })
    // Simulate DB.$transaction throwing (e.g., connection loss mid-transaction)
    mockCreateGeneration.mockRejectedValue(new Error('connection lost'))

    const payload: ExecutionCallbackPayload = {
      runId: 'job-1',
      kind: 'result',
      ts: '2026-04-25T00:00:00.000Z',
      data: {
        artifactUrl: 'https://provider.com/video.mp4',
        mimeType: 'video/mp4',
        width: 1280,
        height: 720,
        duration: 5,
        requestCount: 1,
      },
    }

    const result = await handleExecutionCallback(payload)

    expect(result.action).toBe('failed')
    expect(mockFailGenerationJob).toHaveBeenCalledOnce()
  })
})
```

Note: also add a `mockDb.$transaction` mock to the existing `vi.mock('@/lib/db', ...)` block:

```ts
// In the existing vi.mock('@/lib/db', ...) block, replace with:
vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        generation: {},
        generationCharacterCard: {},
        generationJob: {},
        apiUsageLedger: {},
      }),
    ),
  },
}))
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/execution-callback.service.test.ts --reporter=verbose
```

Expected: New test cases FAIL (the transaction path doesn't exist yet)

- [ ] **Step 3: Implement the transaction wrap**

In `src/services/execution-callback.service.ts`, locate the finalize block (approximately lines 226–296). Replace the `createGeneration` + `Promise.all` sequence with a single `db.$transaction`:

```ts
// BEFORE (lines ~237–285):
const generation = await createGeneration({ ... })
await Promise.all([
  completeGenerationJob(job.id, { ... }),
  createApiUsageEntry({ ... }),
])

// AFTER:
const generation = await db.$transaction(async (tx) => {
  const gen = await createGeneration(
    {
      url: uploadResult.publicUrl,
      storageKey,
      mimeType: resultData.mimeType ?? 'video/mp4',
      width: resultData.width ?? 0,
      height: resultData.height ?? 0,
      duration: resultData.duration,
      referenceImageUrl: metadata.referenceImageUrl,
      prompt: job.prompt ?? '',
      model: job.modelId,
      provider: job.provider,
      requestCount: resultData.requestCount ?? 1,
      outputType: 'VIDEO',
      userId: job.userId,
      characterCardIds: metadata.characterCardIds,
      projectId: metadata.projectId,
      isFreeGeneration: metadata.isFreeGeneration,
      snapshot: toPrismaJson({
        executionCallback: {
          runId: payload.runId,
          ts: payload.ts,
          artifactUrl: resultData.artifactUrl,
          providerMetadata: resultData.providerMetadata,
          cost: resultData.cost,
        },
      }),
    },
    tx,
  )
  await completeGenerationJob(
    job.id,
    {
      generationId: gen.id,
      requestCount: resultData.requestCount ?? 1,
    },
    tx,
  )
  await createApiUsageEntry(
    {
      userId: job.userId,
      generationId: gen.id,
      generationJobId: job.id,
      adapterType: job.adapterType,
      provider: job.provider,
      modelId: job.modelId,
      requestCount: resultData.requestCount ?? 1,
      inputImageCount: metadata.referenceImageUrl ? 1 : 0,
      outputImageCount: 0,
      width: resultData.width,
      height: resultData.height,
      durationMs: Date.now() - job.createdAt.getTime(),
      wasSuccessful: true,
    },
    tx,
  )
  return gen
})
```

Note: `createGeneration`, `completeGenerationJob`, and `createApiUsageEntry` all already accept an optional `client` parameter typed as `Pick<typeof db, ...>`. Prisma interactive transaction clients satisfy these types.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/services/execution-callback.service.test.ts --reporter=verbose
```

Expected: All tests PASS including the new transaction cases

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/execution-callback.service.ts \
        src/services/execution-callback.service.test.ts
git commit -m "fix(execution-callback): wrap finalize DB writes in db.\$transaction for atomicity"
```

---

## Task 3: Atomic Free-Tier Slot Reservation

**Background:** `resolveGenerationRoute` in `generate-image.service.ts` calls `getFreeGenerationCountToday(userId)` then checks `count >= FREE_TIER.DAILY_LIMIT`. Between the count read and the usage entry creation (which happens post-generation), concurrent requests all see the pre-generation count and all pass the check — the race window.

**Chosen approach:** Add a `FreeTierSlot` Prisma model (small, two-column table). To "reserve" a slot: open a `db.$transaction({ isolationLevel: 'Serializable' })`, count existing slots, throw if ≥ limit, insert a new slot. Postgres SSI aborts one of two concurrent transactions that both read count=N and try to insert, converting to a P2034 serialization error which we catch and re-throw as `FREE_LIMIT_EXCEEDED`. After generation (success or failure), call `releaseFreeTierSlot` to clean up (or keep it as a durable daily count).

**Architecture decision:** Keep `FreeTierSlot` as a durable daily reservation table (do not delete on completion). The slot row IS the record that prevents over-usage. Usage ledger entries remain the billing source of truth; slot table is purely a concurrency guard.

**Files:**
- Modify: `prisma/schema.prisma` (add `FreeTierSlot` model)
- Create: `prisma/migrations/<timestamp>_add_free_tier_slot/migration.sql`
- Modify: `src/services/usage.service.ts` (add `atomicReserveFreeTierSlot`)
- Modify: `src/services/generate-image.service.ts` (call `atomicReserveFreeTierSlot` instead of `getFreeGenerationCountToday` in free-tier path)
- Modify: `src/services/free-tier-boundary.test.ts` (assert exact counts)
- Create: `src/services/usage.service.test.ts` (slot reservation unit tests)

- [ ] **Step 1: Add FreeTierSlot to Prisma schema**

In `prisma/schema.prisma`, add:

```prisma
model FreeTierSlot {
  id        String   @id @default(cuid())
  userId    String
  date      String   // YYYY-MM-DD UTC (e.g. "2026-04-25")
  createdAt DateTime @default(now())

  @@index([userId, date])
}
```

- [ ] **Step 2: Generate and apply migration**

```bash
npx prisma migrate dev --name add_free_tier_slot
```

Expected: Migration file created + applied to local dev DB. Verify:

```bash
npx prisma studio
# or: npx prisma db pull | grep FreeTierSlot
```

- [ ] **Step 3: Write failing tests for the new slot functions**

Create `src/services/usage.service.test.ts` (or add to existing if it exists):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ─── DB mock ─────────────────────────────────────────────────────

const mockSlotCount = vi.fn()
const mockSlotCreate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    freeTierSlot: {
      count: (...args: unknown[]) => mockSlotCount(...args),
      create: (...args: unknown[]) => mockSlotCreate(...args),
    },
    $transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) => {
        return fn({
          freeTierSlot: {
            count: (...args: unknown[]) => mockSlotCount(...args),
            create: (...args: unknown[]) => mockSlotCreate(...args),
          },
        })
      },
    ),
  },
}))

vi.mock('@/constants/config', () => ({
  FREE_TIER: { DAILY_LIMIT: 20, ENABLED: true },
  API_USAGE: { DEFAULT_REQUESTS_PER_GENERATION: 1 },
}))

import { atomicReserveFreeTierSlot } from './usage.service'

// ─── Tests ───────────────────────────────────────────────────────

describe('atomicReserveFreeTierSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSlotCreate.mockResolvedValue({ id: 'slot-1' })
  })

  it('creates a slot when count is under daily limit (19 < 20)', async () => {
    mockSlotCount.mockResolvedValue(19)

    await atomicReserveFreeTierSlot('user-1')

    expect(mockSlotCreate).toHaveBeenCalledOnce()
    expect(mockSlotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1' }),
      }),
    )
  })

  it('throws with code FREE_LIMIT_EXCEEDED when count equals daily limit (20 >= 20)', async () => {
    mockSlotCount.mockResolvedValue(20)

    await expect(atomicReserveFreeTierSlot('user-1')).rejects.toMatchObject({
      code: 'FREE_LIMIT_EXCEEDED',
    })
    expect(mockSlotCreate).not.toHaveBeenCalled()
  })

  it('throws with code FREE_LIMIT_EXCEEDED when count exceeds daily limit (25 > 20)', async () => {
    mockSlotCount.mockResolvedValue(25)

    await expect(atomicReserveFreeTierSlot('user-1')).rejects.toMatchObject({
      code: 'FREE_LIMIT_EXCEEDED',
    })
  })

  it('converts Prisma P2034 serialization failure to FREE_LIMIT_EXCEEDED', async () => {
    // P2034 = serialization failure in Prisma (under high concurrency with Serializable isolation)
    mockSlotCount.mockResolvedValue(19)
    const p2034 = Object.assign(
      new Error('Transaction failed due to serialization failure'),
      { code: 'P2034' },
    )
    mockSlotCreate.mockRejectedValue(p2034)

    await expect(atomicReserveFreeTierSlot('user-1')).rejects.toMatchObject({
      code: 'FREE_LIMIT_EXCEEDED',
    })
  })

  it('re-throws non-P2034 errors unchanged', async () => {
    mockSlotCount.mockResolvedValue(19)
    mockSlotCreate.mockRejectedValue(new Error('connection refused'))

    await expect(atomicReserveFreeTierSlot('user-1')).rejects.toThrow('connection refused')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run src/services/usage.service.test.ts --reporter=verbose
```

Expected: FAIL — `atomicReserveFreeTierSlot is not exported from './usage.service'`

- [ ] **Step 5: Implement atomicReserveFreeTierSlot**

Note: `usage.service.ts` must NOT import from `generate-image.service.ts` (circular dep). Define a local error class with the same `code` property shape, then re-throw as `GenerateImageServiceError` from the call site in `generate-image.service.ts`.

Add to `src/services/usage.service.ts`:

```ts
import { FREE_TIER } from '@/constants/config'

/** UTC date string for slot table key (YYYY-MM-DD). */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Thrown when the daily free-tier slot is exhausted. */
export class FreeTierExhaustedError extends Error {
  readonly code = 'FREE_LIMIT_EXCEEDED' as const

  constructor(limit: number) {
    super(
      `Free tier limit reached (${limit}/day). Bind your own API key to continue.`,
    )
    this.name = 'FreeTierExhaustedError'
  }
}

/**
 * Atomically reserve one free-tier generation slot for today.
 * Uses Postgres serializable isolation to prevent over-reservation
 * under concurrent requests. Throws FreeTierExhaustedError if at limit.
 */
export async function atomicReserveFreeTierSlot(userId: string): Promise<void> {
  if (!FREE_TIER.ENABLED) return

  const date = todayUTC()

  try {
    await db.$transaction(
      async (tx) => {
        const count = await tx.freeTierSlot.count({
          where: { userId, date },
        })

        if (count >= FREE_TIER.DAILY_LIMIT) {
          throw new FreeTierExhaustedError(FREE_TIER.DAILY_LIMIT)
        }

        await tx.freeTierSlot.create({
          data: { userId, date },
        })
      },
      { isolationLevel: 'Serializable' },
    )
  } catch (err) {
    // Prisma P2034 = serialization failure — another concurrent transaction
    // already reserved the last slot. Translate to FREE_LIMIT_EXCEEDED.
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'P2034'
    ) {
      throw new FreeTierExhaustedError(FREE_TIER.DAILY_LIMIT)
    }
    throw err
  }
}
```

- [ ] **Step 6: Run usage service tests**

```bash
npx vitest run src/services/usage.service.test.ts --reporter=verbose
```

Expected: All 5 tests PASS

- [ ] **Step 7: Wire atomicReserveFreeTierSlot into generate-image.service.ts**

In `src/services/generate-image.service.ts`, find the free-tier check in `resolveGenerationRoute` (around line 176):

```ts
// BEFORE:
const freeCount = await getFreeGenerationCountToday(userId)
if (freeCount >= FREE_TIER.DAILY_LIMIT) {
  throw new GenerationValidationError(
    'FREE_LIMIT_EXCEEDED',
    `Free tier limit reached (${FREE_TIER.DAILY_LIMIT}/day). Bind your own API key to continue.`,
  )
}
```

Replace with:

```ts
// AFTER:
try {
  await atomicReserveFreeTierSlot(userId)
} catch (err) {
  // FreeTierExhaustedError has .code = 'FREE_LIMIT_EXCEEDED' — re-throw
  // as GenerateImageServiceError to match the existing error handling contract.
  if (
    err instanceof Error &&
    'code' in err &&
    (err as { code: string }).code === 'FREE_LIMIT_EXCEEDED'
  ) {
    throw new GenerateImageServiceError(
      'FREE_LIMIT_EXCEEDED',
      err.message,
      429,
    )
  }
  throw err
}
```

Also add to imports at the top:

```ts
import { atomicReserveFreeTierSlot } from '@/services/usage.service'
```

Remove the unused import of `getFreeGenerationCountToday` if no other callsite uses it:
```bash
grep -r "getFreeGenerationCountToday" src/ --include="*.ts" -l
```

- [ ] **Step 8: Update free-tier-boundary.test.ts to assert (not just document)**

In `src/services/free-tier-boundary.test.ts`, update the mock setup to mock `atomicReserveFreeTierSlot` instead of `getFreeGenerationCountToday`, and update the concurrent test to assert that exactly 20 of 25 requests pass:

Add to the `vi.mock('@/services/usage.service', ...)` block:

```ts
vi.mock('@/services/usage.service', () => ({
  atomicReserveFreeTierSlot: vi.fn(),
  createApiUsageEntry: vi.fn(),
  createGenerationJob: vi.fn(),
  completeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  attachUsageEntryToGeneration: vi.fn(),
}))
```

Then in the concurrent test, implement the slot counter in the mock:

```ts
describe('FreeTier concurrent requests (atomic reservation)', () => {
  it('20 parallel requests with limit 20 — exactly 20 pass, 0 over-run', async () => {
    const mockReserve = vi.mocked(atomicReserveFreeTierSlot)
    let reservedCount = 0

    mockReserve.mockImplementation(async () => {
      if (reservedCount >= 20) {
        const err = new GenerationValidationError(
          'FREE_LIMIT_EXCEEDED',
          'Free tier limit reached (20/day).',
        )
        throw err
      }
      reservedCount++
    })

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        resolveGenerationRoute('user-1', { modelId: FREE_TIER_MODEL }),
      ),
    )

    const passed = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length

    // Exactly 20 pass — no over-run
    expect(passed).toBe(20)
    expect(rejected).toBe(0)
    expect(reservedCount).toBe(20)
  })

  it('25 parallel requests with limit 20 — exactly 20 pass, 5 rejected', async () => {
    const mockReserve = vi.mocked(atomicReserveFreeTierSlot)
    let reservedCount = 0

    mockReserve.mockImplementation(async () => {
      if (reservedCount >= 20) {
        throw new GenerationValidationError(
          'FREE_LIMIT_EXCEEDED',
          'Free tier limit reached (20/day).',
        )
      }
      reservedCount++
    })

    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        resolveGenerationRoute('user-1', { modelId: FREE_TIER_MODEL }),
      ),
    )

    const passed = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length

    expect(passed).toBe(20)
    expect(rejected).toBe(5)
  })
})
```

Remove or archive the old "documents race condition window" test that used `getFreeGenerationCountToday`.

- [ ] **Step 9: Run all free-tier and generate-image tests**

```bash
npx vitest run src/services/free-tier-boundary.test.ts src/services/usage.service.test.ts --reporter=verbose
```

Expected: All tests PASS

- [ ] **Step 10: Run full test suite to verify no regression**

```bash
npx vitest run --reporter=verbose
```

Expected: All existing tests PASS; total test count increases by ~7

- [ ] **Step 11: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma \
        prisma/migrations/ \
        src/services/usage.service.ts \
        src/services/usage.service.test.ts \
        src/services/generate-image.service.ts \
        src/services/free-tier-boundary.test.ts
git commit -m "fix(usage): add FreeTierSlot table + atomicReserveFreeTierSlot with serializable isolation"
```

---

## Acceptance Checklist

- [ ] `src/lib/signature-verifiers/internal-execution.test.ts` — ≥ 6 cases PASS (valid / forged / missing-header / wrong-length / missing-secret / timing-safe)
- [ ] `src/services/execution-callback.service.test.ts` — new transaction-rollback cases PASS
- [ ] `src/services/usage.service.test.ts` — ≥ 5 cases PASS (under-limit / at-limit / over-limit / P2034 / non-P2034)
- [ ] `src/services/free-tier-boundary.test.ts` — concurrent tests changed from "document" to "assert"; 20/25 scenario PASS
- [ ] `src/app/api/internal/execution/callback/route.ts` — no longer contains local HMAC functions
- [ ] `src/app/api/internal/execution/resolve-key/route.ts` — no longer contains local HMAC functions
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run` — full suite green

## Follow-up (P3, not in this plan)

- Nightly R2 orphan scan: list `generations/` prefix in R2, diff against `Generation.storageKey`, delete objects older than 24 h with no matching row
- Expose `FreeTierSlot` cleanup job for daily resets (currently resets naturally because `date` column scopes per-day)
