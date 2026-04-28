# Plan B B.1.4 — Generation Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `generation-evaluator.service.ts` that uses LLM vision to score a generated image against its prompt, stores the result in a new `Generation.evaluation` column, and exposes it via an idempotent `POST /api/generation/evaluate` route.

**Architecture:** The evaluator loads a `Generation` record from DB, fetches the image as a base64 data URL, calls `llmTextCompletion` with an image-aware system prompt, and validates the JSON response against `GenerationEvaluationSchema`. If the LLM returns unparseable output the service returns a fallback score (never throws). The route is idempotent — a generation that already has an `evaluation` value returns it immediately without another LLM call. Three separate commits: schema + migration → service → route.

**Tech Stack:** TypeScript · Zod · Prisma 7 · `llmTextCompletion` + `resolveLlmTextRoute` from `@/services/llm-text.service` · `ensureUser` from `@/services/user.service` · `fetchAsBuffer` from `@/services/storage/r2` · Vitest

---

## Context: What Already Exists

Read these files before starting:

- `src/services/character-scoring.service.ts` — pattern for multimodal LLM calls: `urlToDataUrl` helper converts HTTPS → base64 data URL via `fetchAsBuffer`; `llmTextCompletion` receives `imageData: string | string[]`
- `src/services/llm-text.service.ts` — `resolveLlmTextRoute(userId)` + `llmTextCompletion({ systemPrompt, userPrompt, imageData, adapterType, providerConfig, apiKey })`
- `src/services/user.service.ts` — `ensureUser(clerkId)` returns the DB user record
- `src/constants/config.ts` L140 — `GENERATION_PLAN: '/api/generation/plan'` is already present; add `GENERATION_EVALUATE` next to it
- `src/lib/api-client/generation.ts` — `requestGenerationPlan` already added; add `requestGenerationEvaluate` next to it
- `prisma/schema.prisma` — `model Generation` currently has no `evaluation` field; the schema block starts at line 165
- `src/test/api-helpers.ts` — `FAKE_GENERATION`, `FAKE_DB_USER`, `mockAuthenticated`, `mockUnauthenticated`, `createPOST`, `parseJSON` are all available

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/types/index.ts` | Append `GenerationEvaluationSchema` + `GenerateEvaluationRequestSchema` |
| Create | `src/types/generation-evaluation.test.ts` | Schema validation tests |
| Modify | `prisma/schema.prisma` | Add `evaluation Json?` to `Generation` model |
| Create | `src/services/generation-evaluator.service.ts` | LLM vision scoring, idempotency, DB write |
| Create | `src/services/generation-evaluator.service.test.ts` | Service tests (mock LLM + DB) |
| Modify | `src/constants/config.ts` | Add `GENERATION_EVALUATE` endpoint constant |
| Create | `src/app/api/generation/evaluate/route.ts` | POST handler via `createApiRoute` |
| Create | `src/app/api/generation/evaluate/route.test.ts` | Route tests |
| Modify | `src/lib/api-client/generation.ts` | Add `requestGenerationEvaluate` client function |

---

### Task 1: Schema + Prisma migration

**Files:**
- Modify: `src/types/index.ts` (append after line 2288 — after `GenerationPlanRequest`)
- Create: `src/types/generation-evaluation.test.ts`
- Modify: `prisma/schema.prisma` (add field to `Generation` model)

- [ ] **Step 1: Write the failing schema tests**

Create `src/types/generation-evaluation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import {
  GenerationEvaluationSchema,
  GenerateEvaluationRequestSchema,
} from '@/types'

const VALID_EVAL = {
  subjectMatch: 0.9,
  styleMatch: 0.8,
  compositionMatch: 0.75,
  artifactScore: 1.0,
  promptAdherence: 0.85,
  overall: 0.86,
  detectedIssues: [],
  suggestedFixes: [],
}

describe('GenerationEvaluationSchema', () => {
  it('accepts a valid evaluation with all required fields', () => {
    expect(GenerationEvaluationSchema.safeParse(VALID_EVAL).success).toBe(true)
  })

  it('accepts optional referenceConsistency', () => {
    const result = GenerationEvaluationSchema.safeParse({
      ...VALID_EVAL,
      referenceConsistency: 0.75,
      detectedIssues: ['Subject hair color wrong'],
      suggestedFixes: ['Add "blonde hair" to prompt'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a score above 1.0', () => {
    expect(
      GenerationEvaluationSchema.safeParse({ ...VALID_EVAL, subjectMatch: 1.5 })
        .success,
    ).toBe(false)
  })

  it('rejects a score below 0', () => {
    expect(
      GenerationEvaluationSchema.safeParse({ ...VALID_EVAL, overall: -0.1 })
        .success,
    ).toBe(false)
  })

  it('rejects when a required field is missing', () => {
    const { overall: _omit, ...withoutOverall } = VALID_EVAL
    expect(GenerationEvaluationSchema.safeParse(withoutOverall).success).toBe(
      false,
    )
  })
})

describe('GenerateEvaluationRequestSchema', () => {
  it('accepts a valid generationId', () => {
    expect(
      GenerateEvaluationRequestSchema.safeParse({ generationId: 'gen_abc123' })
        .success,
    ).toBe(true)
  })

  it('rejects an empty generationId', () => {
    expect(
      GenerateEvaluationRequestSchema.safeParse({ generationId: '' }).success,
    ).toBe(false)
  })

  it('rejects when generationId is missing', () => {
    expect(GenerateEvaluationRequestSchema.safeParse({}).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/types/generation-evaluation.test.ts --reporter=verbose
```

Expected: all 8 tests FAIL with `Cannot find module` or missing export error.

- [ ] **Step 3: Append schemas to `src/types/index.ts`**

At the very end of `src/types/index.ts` (after the `GenerationPlanRequest` export on line 2288), append:

```ts
// ─── Creative Control: Generation Evaluation ──────────────────────

/**
 * LLM vision evaluation of a generated image against its prompt.
 * Scores are 0.0–1.0. Stored in Generation.evaluation as JSON.
 */
export const GenerationEvaluationSchema = z.object({
  /** How well the main subject matches the prompt description */
  subjectMatch: z.number().min(0).max(1),
  /** How well the visual style matches the prompt */
  styleMatch: z.number().min(0).max(1),
  /** How well the composition / framing matches the prompt */
  compositionMatch: z.number().min(0).max(1),
  /** Reference image consistency — present only when referenceAssets were used */
  referenceConsistency: z.number().min(0).max(1).optional(),
  /** Image quality: 1.0 = pristine, 0.0 = severe artifacts */
  artifactScore: z.number().min(0).max(1),
  /** Overall prompt adherence */
  promptAdherence: z.number().min(0).max(1),
  /** Weighted overall quality score */
  overall: z.number().min(0).max(1),
  /** Specific visual issues detected (max 10) */
  detectedIssues: z.array(z.string().max(200)).max(10),
  /** Actionable prompt improvements (max 10) */
  suggestedFixes: z.array(z.string().max(200)).max(10),
})

export type GenerationEvaluation = z.infer<typeof GenerationEvaluationSchema>

export const GenerateEvaluationRequestSchema = z.object({
  /** The ID of the generation to evaluate */
  generationId: z.string().min(1),
})

export type GenerateEvaluationRequest = z.infer<
  typeof GenerateEvaluationRequestSchema
>
```

- [ ] **Step 4: Add `evaluation Json?` to `prisma/schema.prisma`**

Inside the `model Generation { ... }` block (around line 216, after `snapshot`), add the new field:

```prisma
  snapshot      Json? // Full input parameter snapshot
  evaluation    Json? // GenerationEvaluation — written by generation-evaluator.service
```

- [ ] **Step 5: Run the Prisma migration**

```bash
npx prisma migrate dev --name add_generation_evaluation
```

Expected output: `The following migration(s) have been created and applied ... add_generation_evaluation`

If prompted about existing data, confirm — the column is nullable so all existing rows get `null`.

- [ ] **Step 6: Run schema tests to confirm all 8 pass**

```bash
npx vitest run src/types/generation-evaluation.test.ts --reporter=verbose
```

Expected: 8/8 PASS

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/types/generation-evaluation.test.ts prisma/schema.prisma prisma/migrations/
git commit -m "feat(plan-b): add GenerationEvaluationSchema and evaluation column migration"
```

---

### Task 2: Generation evaluator service

**Files:**
- Create: `src/services/generation-evaluator.service.ts`
- Create: `src/services/generation-evaluator.service.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `src/services/generation-evaluator.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
const mockResolveRoute = vi.fn()
const mockLlmCompletion = vi.fn()
const mockFindFirstGeneration = vi.fn()
const mockUpdateGeneration = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/llm-text.service', () => ({
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveRoute(...args),
  llmTextCompletion: (...args: unknown[]) => mockLlmCompletion(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findFirst: (...args: unknown[]) => mockFindFirstGeneration(...args),
      update: (...args: unknown[]) => mockUpdateGeneration(...args),
    },
  },
}))

import { evaluateGeneration } from '@/services/generation-evaluator.service'

const FAKE_USER = { id: 'db_user_123', clerkId: 'clerk_test_user' }

const FAKE_ROUTE = {
  adapterType: 'gemini',
  providerConfig: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  apiKey: 'test-api-key',
}

// Use a data: URL so the service skips the R2 fetch
const FAKE_GENERATION = {
  id: 'gen_abc',
  url: 'data:image/png;base64,iVBORw0KGgo=',
  prompt: 'a woman in red coat standing in rain',
  evaluation: null,
}

const VALID_LLM_RESPONSE = JSON.stringify({
  subjectMatch: 0.9,
  styleMatch: 0.8,
  compositionMatch: 0.75,
  artifactScore: 1.0,
  promptAdherence: 0.85,
  overall: 0.86,
  detectedIssues: [],
  suggestedFixes: [],
})

describe('evaluateGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveRoute.mockResolvedValue(FAKE_ROUTE)
    mockFindFirstGeneration.mockResolvedValue(FAKE_GENERATION)
    mockUpdateGeneration.mockResolvedValue({ ...FAKE_GENERATION })
    mockLlmCompletion.mockResolvedValue(VALID_LLM_RESPONSE)
  })

  it('returns a valid evaluation on happy path', async () => {
    const result = await evaluateGeneration('clerk_test_user', 'gen_abc')
    expect(result.overall).toBeGreaterThanOrEqual(0)
    expect(result.overall).toBeLessThanOrEqual(1)
    expect(result.detectedIssues).toBeInstanceOf(Array)
    expect(result.suggestedFixes).toBeInstanceOf(Array)
  })

  it('writes the evaluation to the database', async () => {
    await evaluateGeneration('clerk_test_user', 'gen_abc')
    expect(mockUpdateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gen_abc' },
        data: expect.objectContaining({ evaluation: expect.any(Object) }),
      }),
    )
  })

  it('returns existing evaluation without calling LLM (idempotent)', async () => {
    const existingEval = {
      subjectMatch: 0.7, styleMatch: 0.6, compositionMatch: 0.5,
      artifactScore: 0.9, promptAdherence: 0.65, overall: 0.67,
      detectedIssues: ['subject too dark'], suggestedFixes: ['increase brightness'],
    }
    mockFindFirstGeneration.mockResolvedValue({
      ...FAKE_GENERATION,
      evaluation: existingEval,
    })

    const result = await evaluateGeneration('clerk_test_user', 'gen_abc')

    expect(mockLlmCompletion).not.toHaveBeenCalled()
    expect(result.overall).toBe(0.67)
  })

  it('throws when generation is not found', async () => {
    mockFindFirstGeneration.mockResolvedValue(null)
    await expect(evaluateGeneration('clerk_test_user', 'gen_missing')).rejects.toThrow(
      'Generation not found',
    )
  })

  it('returns fallback evaluation when LLM output is not valid JSON', async () => {
    mockLlmCompletion.mockResolvedValue('Sorry, I cannot evaluate this image.')
    const result = await evaluateGeneration('clerk_test_user', 'gen_abc')
    expect(result.overall).toBe(0.5)
    expect(mockUpdateGeneration).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/services/generation-evaluator.service.test.ts --reporter=verbose
```

Expected: all 5 tests FAIL with `Cannot find module '@/services/generation-evaluator.service'`

- [ ] **Step 3: Implement the service**

Create `src/services/generation-evaluator.service.ts`:

```ts
import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  GenerationEvaluationSchema,
  type GenerationEvaluation,
} from '@/types'
import { ensureUser } from '@/services/user.service'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { fetchAsBuffer } from '@/services/storage/r2'

// ─── Constants ──────────────────────────────────────────────────

const FALLBACK_EVALUATION: GenerationEvaluation = {
  subjectMatch: 0.5,
  styleMatch: 0.5,
  compositionMatch: 0.5,
  artifactScore: 1.0,
  promptAdherence: 0.5,
  overall: 0.5,
  detectedIssues: [],
  suggestedFixes: [
    'Automatic evaluation unavailable. Please review the image manually.',
  ],
}

const EVALUATION_SYSTEM_PROMPT = `You are an expert AI image quality evaluator. Given an AI-generated image and its generation prompt, evaluate how well the image matches the intended prompt.

Return ONLY valid JSON matching this exact schema:
{
  "subjectMatch": <0.0-1.0, how well the main subject is depicted>,
  "styleMatch": <0.0-1.0, how well the visual style matches>,
  "compositionMatch": <0.0-1.0, how well framing and composition match>,
  "artifactScore": <0.0-1.0, where 1.0 means no artifacts and 0.0 means severe artifacts>,
  "promptAdherence": <0.0-1.0, overall prompt following>,
  "overall": <0.0-1.0, weighted overall quality>,
  "detectedIssues": ["specific issue 1", "specific issue 2"],
  "suggestedFixes": ["actionable prompt improvement 1", "actionable prompt improvement 2"]
}

Rules:
- All scores are 0.0 (poor) to 1.0 (excellent)
- detectedIssues: list up to 5 specific visual problems observed
- suggestedFixes: list up to 5 concrete prompt improvements
- Return raw JSON only. No markdown fences. No explanation.`

// ─── Helpers ────────────────────────────────────────────────────

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const { buffer, mimeType } = await fetchAsBuffer(url)
  const base64 = buffer.toString('base64')
  return `data:${mimeType};base64,${base64}`
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Evaluate a generation using LLM vision scoring.
 * Idempotent: if the generation already has an evaluation, returns it immediately.
 * Never throws on LLM failures — returns FALLBACK_EVALUATION instead.
 * Throws only when the generation record is not found or ownership fails.
 */
export async function evaluateGeneration(
  clerkId: string,
  generationId: string,
): Promise<GenerationEvaluation> {
  const dbUser = await ensureUser(clerkId)

  const generation = await db.generation.findFirst({
    where: { id: generationId, userId: dbUser.id },
    select: { id: true, url: true, prompt: true, evaluation: true },
  })

  if (!generation) {
    throw new Error('Generation not found')
  }

  // Idempotency: return cached result if it already exists
  if (generation.evaluation) {
    const cached = GenerationEvaluationSchema.safeParse(generation.evaluation)
    if (cached.success) return cached.data
  }

  try {
    const route = await resolveLlmTextRoute(dbUser.id)
    const imageDataUrl = await urlToDataUrl(generation.url)

    const raw = await llmTextCompletion({
      systemPrompt: EVALUATION_SYSTEM_PROMPT,
      userPrompt: `Evaluate this AI-generated image against the following prompt:\n"${generation.prompt}"\n\nReturn a JSON evaluation following the schema in the system instruction.`,
      imageData: imageDataUrl,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
    })

    const parsed: unknown = JSON.parse(stripMarkdownFences(raw))
    const validated = GenerationEvaluationSchema.safeParse(parsed)

    if (!validated.success) {
      logger.warn('Generation evaluator: LLM output failed schema validation', {
        generationId,
        issues: validated.error.issues,
      })
      return FALLBACK_EVALUATION
    }

    await db.generation.update({
      where: { id: generationId },
      data: { evaluation: validated.data },
    })

    return validated.data
  } catch (error) {
    logger.warn('Generation evaluator: LLM call failed, returning fallback', {
      generationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return FALLBACK_EVALUATION
  }
}
```

- [ ] **Step 4: Run tests to confirm all 5 pass**

```bash
npx vitest run src/services/generation-evaluator.service.test.ts --reporter=verbose
```

Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/generation-evaluator.service.ts src/services/generation-evaluator.service.test.ts
git commit -m "feat(plan-b): add generation-evaluator service with LLM vision scoring and idempotency"
```

---

### Task 3: Route + config constant + api-client

**Files:**
- Modify: `src/constants/config.ts` (add `GENERATION_EVALUATE` to `API_ENDPOINTS`)
- Create: `src/app/api/generation/evaluate/route.ts`
- Create: `src/app/api/generation/evaluate/route.test.ts`
- Modify: `src/lib/api-client/generation.ts` (add `requestGenerationEvaluate`)

- [ ] **Step 1: Write the failing route tests**

Create `src/app/api/generation/evaluate/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEvaluate = vi.fn()

vi.mock('@/services/generation-evaluator.service', () => ({
  evaluateGeneration: (...args: unknown[]) => mockEvaluate(...args),
}))

import { POST } from '@/app/api/generation/evaluate/route'

const SAMPLE_EVALUATION = {
  subjectMatch: 0.9,
  styleMatch: 0.8,
  compositionMatch: 0.75,
  artifactScore: 1.0,
  promptAdherence: 0.85,
  overall: 0.86,
  detectedIssues: [],
  suggestedFixes: [],
}

describe('POST /api/generation/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockEvaluate.mockResolvedValue(SAMPLE_EVALUATION)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/generation/evaluate', { generationId: 'gen_abc' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when generationId is missing', async () => {
    const req = createPOST('/api/generation/evaluate', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when generationId is an empty string', async () => {
    const req = createPOST('/api/generation/evaluate', { generationId: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with evaluation on valid request', async () => {
    const req = createPOST('/api/generation/evaluate', { generationId: 'gen_abc' })
    const res = await POST(req)
    const body = await parseJSON<{
      success: boolean
      data: typeof SAMPLE_EVALUATION
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.overall).toBe(0.86)
    expect(Array.isArray(body.data.detectedIssues)).toBe(true)
  })

  it('calls evaluateGeneration with the authenticated clerkId', async () => {
    const req = createPOST('/api/generation/evaluate', { generationId: 'gen_xyz' })
    await POST(req)
    expect(mockEvaluate).toHaveBeenCalledWith('clerk_test_user', 'gen_xyz')
  })

  it('returns 500 when service throws (e.g. generation not found)', async () => {
    mockEvaluate.mockRejectedValue(new Error('Generation not found'))
    const req = createPOST('/api/generation/evaluate', { generationId: 'gen_missing' })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run route tests to confirm they fail**

```bash
npx vitest run src/app/api/generation/evaluate/route.test.ts --reporter=verbose
```

Expected: all 6 tests FAIL with `Cannot find module '@/app/api/generation/evaluate/route'`

- [ ] **Step 3: Add the endpoint constant to `src/constants/config.ts`**

Find the line `GENERATION_PLAN: '/api/generation/plan',` (around line 140) and add the new constant directly below it:

```ts
  GENERATION_PLAN: '/api/generation/plan',
  GENERATION_EVALUATE: '/api/generation/evaluate',
```

- [ ] **Step 4: Create the route**

Create `src/app/api/generation/evaluate/route.ts`:

```ts
import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerateEvaluationRequestSchema,
  type GenerationEvaluation,
} from '@/types'
import { evaluateGeneration } from '@/services/generation-evaluator.service'

export const POST = createApiRoute<
  typeof GenerateEvaluationRequestSchema,
  GenerationEvaluation
>({
  schema: GenerateEvaluationRequestSchema,
  routeName: 'POST /api/generation/evaluate',
  handler: async (clerkId, data) => {
    return evaluateGeneration(clerkId, data.generationId)
  },
})
```

- [ ] **Step 5: Add the api-client function**

Open `src/lib/api-client/generation.ts`. Find the `requestGenerationPlan` function and add `requestGenerationEvaluate` immediately after it. The exact addition depends on the file's current structure; add:

```ts
export async function requestGenerationEvaluate(
  generationId: string,
): Promise<GenerationEvaluation> {
  const res = await apiClient.post<GenerationEvaluation>(
    API_ENDPOINTS.GENERATION_EVALUATE,
    { generationId },
  )
  return res.data
}
```

Make sure `GenerationEvaluation` is imported from `@/types` and `API_ENDPOINTS` is imported from `@/constants/config`. Follow the existing import pattern in the file.

- [ ] **Step 6: Run route tests to confirm all 6 pass**

```bash
npx vitest run src/app/api/generation/evaluate/route.test.ts --reporter=verbose
```

Expected: 6/6 PASS

- [ ] **Step 7: Run the full suite to check for regressions**

```bash
npx vitest run src/services/ src/types/ src/app/api/generation/ --reporter=verbose
```

Expected: all passing, no regressions

- [ ] **Step 8: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add src/constants/config.ts src/app/api/generation/evaluate/route.ts src/app/api/generation/evaluate/route.test.ts src/lib/api-client/generation.ts
git commit -m "feat(plan-b): add POST /api/generation/evaluate route with idempotent LLM vision scoring"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ `GenerationEvaluationSchema` with all 9 fields from spec (subjectMatch / styleMatch / compositionMatch / referenceConsistency / artifactScore / promptAdherence / overall / detectedIssues / suggestedFixes)
- ✅ `Generation.evaluation Json?` column added via Prisma migration
- ✅ `evaluateGeneration` service with LLM vision call
- ✅ Idempotency: returns cached result if `generation.evaluation` already exists
- ✅ Async trigger path: route exposes idempotent `POST /api/generation/evaluate`; worker integration is deferred to a later task
- ✅ `character-scoring` relationship: evaluator is general-purpose; character-scoring is unchanged and can be called as a sub-module later if needed

**2. Placeholder scan:** No TBDs or vague instructions. All code blocks are complete.

**3. Type consistency:**
- `GenerationEvaluation` type is defined in Task 1 and used identically in Tasks 2 and 3
- `GenerateEvaluationRequestSchema` defined in Task 1, used in Task 3 route
- `evaluateGeneration(clerkId: string, generationId: string): Promise<GenerationEvaluation>` — consistent across service + route + tests

## Verification Contract

```bash
# After Task 1
npx vitest run src/types/generation-evaluation.test.ts --reporter=verbose
# Expected: 8/8 PASS

# After Task 2
npx vitest run src/services/generation-evaluator.service.test.ts --reporter=verbose
# Expected: 5/5 PASS

# After Task 3
npx vitest run src/app/api/generation/evaluate/route.test.ts --reporter=verbose
# Expected: 6/6 PASS

npx tsc --noEmit
# Expected: 0 errors
```
