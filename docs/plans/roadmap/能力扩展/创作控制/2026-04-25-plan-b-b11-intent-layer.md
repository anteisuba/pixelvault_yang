# Plan B — B.1.1 Intent Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 来源规划: [tech-debt-and-creative-control-roadmap](../../../product/tech-debt-and-creative-control-roadmap.md)

**Goal:** Add `ImageIntent` + `ReferenceAsset` Zod schemas, an LLM-driven intent-parser service, a static model-router service (Round-1 weights only), and a `POST /api/generation/plan` route that ties them together — giving the frontend the data it needs to show a generation plan card before the user submits.

**Architecture:**
- Types first (`src/types/index.ts` append-only), then services, then route, then API-client function.
- `intent-parser.service.ts` calls `llmTextCompletion` (already exists in `llm-text.service.ts`) and validates the JSON output with `validateLlmStructuredOutput` (new helper in `llm-output-validator.ts`).
- `model-router.service.ts` is pure-functional (no I/O): scores models using static `MODEL_STRENGTHS` data, returns a ranked list.
- Route does auth → validate → call intent-parser + model-router → return combined response.
- No Studio UI or `studio-context.tsx` changes in this plan — UI (B.1.5) is a separate plan.

**Tech Stack:** Zod, Vitest, `llm-text.service.ts`, `llm-output-validator.ts`, `prompt-guard.ts`, `api-route-factory.ts`, `model-strengths.ts`

**High-risk module check (CLAUDE.md Change Safety Protocol):**
```bash
# Run before starting: confirm types/index.ts impact scope
grep -r "import.*from.*@/types" src/ --include="*.ts" --include="*.tsx" -l | wc -l
# Expected: ~189 — adding optional new exports does not break any of them
# This plan only ADDS new exports; it never modifies existing schemas
```

---

## File Structure

```
src/types/index.ts                              — append ReferenceAssetSchema + ImageIntentSchema
src/types/intent-schema.test.ts                 — NEW: schema unit tests
src/services/intent-parser.service.ts           — NEW: LLM → ImageIntent
src/services/intent-parser.service.test.ts      — NEW
src/services/model-router.service.ts            — NEW: ImageIntent → ranked models
src/services/model-router.service.test.ts       — NEW
src/app/api/generation/plan/route.ts            — NEW: POST /api/generation/plan
src/app/api/generation/plan/route.test.ts       — NEW
src/lib/api-client/generation.ts               — append requestGenerationPlan()
src/constants/config.ts                         — append API_ENDPOINTS.GENERATION_PLAN
```

---

## Task 1: Add `ReferenceAssetSchema` + `ImageIntentSchema` to `src/types/index.ts`

**Files:**
- Modify: `src/types/index.ts` (append at end of Zod schema section)
- Create: `src/types/intent-schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `src/types/intent-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ReferenceAssetSchema, ImageIntentSchema } from '@/types'

describe('ReferenceAssetSchema', () => {
  it('accepts a minimal valid asset (url + role only)', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'identity',
    })
    expect(result.success).toBe(true)
  })

  it('accepts all optional fields', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'pose',
      weight: 0.8,
      notes: 'use for body pose only',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid role', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'magic',
    })
    expect(result.success).toBe(false)
  })

  it('rejects weight out of range (1.5 > 1.0)', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'https://example.com/img.png',
      role: 'style',
      weight: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-URL string', () => {
    const result = ReferenceAssetSchema.safeParse({
      url: 'not-a-url',
      role: 'identity',
    })
    expect(result.success).toBe(false)
  })
})

describe('ImageIntentSchema', () => {
  const minimal = {
    subject: 'a young woman',
  }

  it('accepts minimal intent (subject only)', () => {
    const result = ImageIntentSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('accepts fully specified intent', () => {
    const full = {
      subject: 'a young woman',
      subjectDetails: 'long dark hair, wearing a red coat',
      actionOrPose: 'standing in rain',
      scene: 'Tokyo street at night',
      composition: 'close-up portrait',
      camera: '85mm f/1.8 lens',
      lighting: 'neon reflections, wet pavement',
      colorPalette: 'cyan and magenta tones',
      style: 'cinematic photorealism',
      mood: 'melancholic',
      mustInclude: ['red coat', 'umbrella'],
      mustAvoid: ['logo', 'text'],
      referenceAssets: [
        { url: 'https://example.com/ref.jpg', role: 'identity' },
      ],
    }
    const result = ImageIntentSchema.safeParse(full)
    expect(result.success).toBe(true)
  })

  it('rejects empty subject', () => {
    const result = ImageIntentSchema.safeParse({ subject: '' })
    expect(result.success).toBe(false)
  })

  it('rejects subject exceeding max length', () => {
    const result = ImageIntentSchema.safeParse({ subject: 'a'.repeat(501) })
    expect(result.success).toBe(false)
  })

  it('rejects invalid referenceAsset within array', () => {
    const result = ImageIntentSchema.safeParse({
      subject: 'test',
      referenceAssets: [{ url: 'not-a-url', role: 'identity' }],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/types/intent-schema.test.ts --reporter=verbose
```

Expected: FAIL — `ReferenceAssetSchema` and `ImageIntentSchema` not exported from `@/types`

- [ ] **Step 3: Append the schemas to src/types/index.ts**

Scroll to the end of `src/types/index.ts` and append (do NOT modify any existing schema):

```ts
// ─── Creative Control: Intent + Reference Asset ───────────────────

/**
 * A reference image and its intended creative role.
 * Used in ImageIntent to tell the model HOW to use the reference.
 */
export const ReferenceAssetSchema = z.object({
  /** HTTPS URL of the reference image */
  url: z.string().url(),
  /**
   * How the model should interpret this reference:
   * - identity: subject/character likeness
   * - pose: body pose / keypoints
   * - style: visual style / artistic look
   * - composition: scene layout / framing
   * - background: background / setting
   * - product: product placement / object
   * - first_frame: first frame of a video clip
   * - last_frame: last frame of a video clip
   */
  role: z.enum([
    'identity',
    'pose',
    'style',
    'composition',
    'background',
    'product',
    'first_frame',
    'last_frame',
  ]),
  /** Influence weight (0.0–1.0, provider-dependent) */
  weight: z.number().min(0).max(1).optional(),
  /** Human-readable notes passed to prompt compiler */
  notes: z.string().max(200).optional(),
})

export type ReferenceAsset = z.infer<typeof ReferenceAssetSchema>

/**
 * Structured user intent for image generation.
 * The output of intent-parser.service and the input to prompt-compiler.service.
 * All fields except `subject` are optional — the LLM fills them from context.
 */
export const ImageIntentSchema = z.object({
  /** Primary subject (person, object, creature) — required */
  subject: z.string().min(1).max(500),
  /** Additional subject details (appearance, clothing, identity) */
  subjectDetails: z.string().max(500).optional(),
  /** What the subject is doing or how they are posed */
  actionOrPose: z.string().max(300).optional(),
  /** Scene / environment description */
  scene: z.string().max(500).optional(),
  /** Framing / composition (e.g. "rule of thirds", "low angle", "close-up") */
  composition: z.string().max(300).optional(),
  /** Camera and lens details (e.g. "85mm f/1.8", "fish-eye", "drone shot") */
  camera: z.string().max(300).optional(),
  /** Lighting setup (e.g. "golden hour", "studio three-point", "neon reflections") */
  lighting: z.string().max(300).optional(),
  /** Color palette / grading notes */
  colorPalette: z.string().max(300).optional(),
  /** Visual style category (e.g. "photorealism", "anime", "oil painting") */
  style: z.string().max(300).optional(),
  /** Emotional tone / atmosphere */
  mood: z.string().max(300).optional(),
  /** Elements that MUST appear in the result */
  mustInclude: z.array(z.string().max(100)).max(10).optional(),
  /** Elements that MUST NOT appear in the result (negative intent) */
  mustAvoid: z.array(z.string().max(100)).max(10).optional(),
  /** Reference images with their creative roles */
  referenceAssets: z.array(ReferenceAssetSchema).max(5).optional(),
})

export type ImageIntent = z.infer<typeof ImageIntentSchema>

/** Response type for POST /api/generation/plan */
export const GenerationPlanResponseSchema = z.object({
  intent: ImageIntentSchema,
  recommendedModels: z.array(
    z.object({
      modelId: z.string(),
      score: z.number(),
      reason: z.string(),
      matchedBestFor: z.array(z.string()),
    }),
  ),
  promptDraft: z.string(),
  negativePromptDraft: z.string().optional(),
  variationCount: z.number().int().min(1).max(8),
})

export type GenerationPlanResponse = z.infer<typeof GenerationPlanResponseSchema>

/** Request type for POST /api/generation/plan */
export const GenerationPlanRequestSchema = z.object({
  /** Natural language description of what the user wants to generate */
  naturalLanguage: z.string().min(1).max(2000),
  /** Optional reference images with roles */
  referenceAssets: z.array(ReferenceAssetSchema).max(5).optional(),
})

export type GenerationPlanRequest = z.infer<typeof GenerationPlanRequestSchema>
```

- [ ] **Step 4: Run schema tests to verify they pass**

```bash
npx vitest run src/types/intent-schema.test.ts --reporter=verbose
```

Expected: 10 tests PASS

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/types/intent-schema.test.ts
git commit -m "feat(types): add ReferenceAssetSchema + ImageIntentSchema + GenerationPlanRequest/Response"
```

---

## Task 2: Create intent-parser.service.ts

**Files:**
- Create: `src/services/intent-parser.service.ts`
- Create: `src/services/intent-parser.service.test.ts`

**What it does:** Takes `naturalLanguage + referenceAssets`, sends to LLM with a structured extraction prompt, parses the JSON response, validates with `ImageIntentSchema.safeParse`. On LLM failure, returns a minimal intent containing the raw `naturalLanguage` as `subject`.

- [ ] **Step 1: Write failing tests**

Create `src/services/intent-parser.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmRoute(...args),
}))

vi.mock('@/lib/prompt-guard', () => ({
  validatePrompt: vi.fn(() => ({ valid: true })),
  sanitizePrompt: vi.fn((p: string) => p),
}))

const FAKE_ROUTE = {
  adapterType: 'gemini',
  providerConfig: { endpoint: 'https://gemini.example.com', name: 'Gemini' },
  apiKey: 'test-key',
}

import { parseImageIntent } from './intent-parser.service'
import type { ReferenceAsset } from '@/types'

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
})

describe('parseImageIntent', () => {
  it('returns parsed ImageIntent when LLM returns valid JSON', async () => {
    const llmJson = JSON.stringify({
      subject: 'a young woman',
      style: 'cinematic photorealism',
      mood: 'melancholic',
      scene: 'Tokyo street at night',
    })
    mockLlmCompletion.mockResolvedValue(llmJson)

    const result = await parseImageIntent('a cinematic portrait in Tokyo')

    expect(result.subject).toBe('a young woman')
    expect(result.style).toBe('cinematic photorealism')
    expect(result.mood).toBe('melancholic')
  })

  it('falls back to minimal intent when LLM returns invalid JSON', async () => {
    mockLlmCompletion.mockResolvedValue('not valid json at all')

    const result = await parseImageIntent('a cat playing piano')

    // Fallback: raw input becomes subject
    expect(result.subject).toBe('a cat playing piano')
  })

  it('falls back to minimal intent when LLM throws', async () => {
    mockLlmCompletion.mockRejectedValue(new Error('LLM provider timeout'))

    const result = await parseImageIntent('a rainy street')

    expect(result.subject).toBe('a rainy street')
  })

  it('includes referenceAssets in returned intent when provided', async () => {
    const refs: ReferenceAsset[] = [
      { url: 'https://example.com/ref.jpg', role: 'identity' },
    ]
    const llmJson = JSON.stringify({ subject: 'person from reference' })
    mockLlmCompletion.mockResolvedValue(llmJson)

    const result = await parseImageIntent('portrait', refs)

    expect(result.referenceAssets).toEqual(refs)
  })

  it('falls back gracefully when LLM returns JSON with wrong schema', async () => {
    // LLM returns JSON but with missing `subject` field
    mockLlmCompletion.mockResolvedValue(JSON.stringify({ style: 'anime' }))

    const result = await parseImageIntent('anime girl')

    // Fallback preserves original input as subject
    expect(result.subject).toBe('anime girl')
  })

  it('strips LLM markdown fences before parsing', async () => {
    const wrapped = '```json\n{"subject":"test subject"}\n```'
    mockLlmCompletion.mockResolvedValue(wrapped)

    const result = await parseImageIntent('some prompt')

    expect(result.subject).toBe('test subject')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/services/intent-parser.service.test.ts --reporter=verbose
```

Expected: FAIL — `parseImageIntent is not exported from './intent-parser.service'`

- [ ] **Step 3: Implement intent-parser.service.ts**

Create `src/services/intent-parser.service.ts`:

```ts
import 'server-only'

import { ImageIntentSchema, type ImageIntent, type ReferenceAsset } from '@/types'
import { logger } from '@/lib/logger'
import { validatePrompt, sanitizePrompt } from '@/lib/prompt-guard'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'

// ─── System Prompt ────────────────────────────────────────────────

const INTENT_EXTRACTION_SYSTEM_PROMPT = `You are an expert image generation prompt analyst. 
Your task is to extract structured intent from a user's natural language description.

Return ONLY a JSON object with these optional fields (only include fields you can infer):
{
  "subject": "string (REQUIRED - the main subject)",
  "subjectDetails": "string (optional - appearance, clothing)",
  "actionOrPose": "string (optional - what they are doing)",
  "scene": "string (optional - environment/location)",
  "composition": "string (optional - framing like 'close-up', 'wide shot')",
  "camera": "string (optional - lens/camera details)",
  "lighting": "string (optional - lighting conditions)",
  "colorPalette": "string (optional - colors/tones)",
  "style": "string (optional - visual style: 'photorealism', 'anime', 'oil painting' etc.)",
  "mood": "string (optional - emotional tone)",
  "mustInclude": ["string array of elements that must appear"],
  "mustAvoid": ["string array of elements to avoid"]
}

Rules:
- Always extract a "subject" field — it is required.
- Only include fields you can confidently infer from the description.
- Do not invent details not implied by the description.
- Return raw JSON only — no markdown, no explanation.`

// ─── Helpers ─────────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

function buildFallbackIntent(
  naturalLanguage: string,
  referenceAssets?: ReferenceAsset[],
): ImageIntent {
  return {
    subject: naturalLanguage.slice(0, 500),
    referenceAssets,
  }
}

// ─── Service ─────────────────────────────────────────────────────

/**
 * Parse natural language user input into a structured `ImageIntent`.
 * Uses LLM extraction; falls back to a minimal intent on any LLM failure.
 */
export async function parseImageIntent(
  naturalLanguage: string,
  referenceAssets?: ReferenceAsset[],
): Promise<ImageIntent> {
  const guardResult = validatePrompt(naturalLanguage)
  if (!guardResult.valid) {
    logger.warn('Intent parser: prompt failed guard, using fallback', {
      reason: guardResult.reason,
    })
    return buildFallbackIntent(naturalLanguage, referenceAssets)
  }

  const safeInput = sanitizePrompt(naturalLanguage)

  try {
    const route = await resolveLlmTextRoute()
    const rawOutput = await llmTextCompletion({
      systemPrompt: INTENT_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: `Extract intent from: "${safeInput}"`,
      adapterType: route.adapterType,
      providerConfig: route.providerConfig,
      apiKey: route.apiKey,
    })

    const cleaned = stripMarkdownFences(rawOutput)
    const parsed: unknown = JSON.parse(cleaned)
    const validated = ImageIntentSchema.safeParse(parsed)

    if (!validated.success) {
      logger.warn('Intent parser: LLM output failed schema validation', {
        issues: validated.error.issues,
      })
      return buildFallbackIntent(naturalLanguage, referenceAssets)
    }

    // Merge in caller-provided referenceAssets (override LLM-guessed ones)
    return {
      ...validated.data,
      referenceAssets: referenceAssets ?? validated.data.referenceAssets,
    }
  } catch (err) {
    logger.warn('Intent parser: LLM call failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    return buildFallbackIntent(naturalLanguage, referenceAssets)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/services/intent-parser.service.test.ts --reporter=verbose
```

Expected: All 6 tests PASS

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/intent-parser.service.ts \
        src/services/intent-parser.service.test.ts
git commit -m "feat(services): add intent-parser.service — LLM-driven ImageIntent extraction with fallback"
```

---

## Task 3: Create model-router.service.ts

**Files:**
- Create: `src/services/model-router.service.ts`
- Create: `src/services/model-router.service.test.ts`

**What it does:** Takes `ImageIntent`, derives task keywords, scores each model in `MODEL_STRENGTHS` by overlap with `bestFor[]`, returns up to 5 ranked `RecommendedModel` results. Pure function — no I/O, no async, no DB.

**Round-1 scope:** Static weights only. `arena/model-winrate` integration is Round-2 (B.1.7).

- [ ] **Step 1: Write failing tests**

Create `src/services/model-router.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { routeModelsForIntent } from './model-router.service'
import type { ImageIntent } from '@/types'

describe('routeModelsForIntent', () => {
  it('returns a non-empty ranked list for a photorealistic portrait intent', () => {
    const intent: ImageIntent = {
      subject: 'a woman',
      style: 'photorealism',
      mood: 'dramatic',
    }
    const results = routeModelsForIntent(intent)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toMatchObject({
      modelId: expect.any(String),
      score: expect.any(Number),
      reason: expect.any(String),
      matchedBestFor: expect.any(Array),
    })
  })

  it('ranks photorealistic models higher for photorealism intent', () => {
    const intent: ImageIntent = {
      subject: 'product photo',
      style: 'photorealistic',
    }
    const results = routeModelsForIntent(intent)
    const topResult = results[0]

    // At least the top result should have a photorealistic bestFor match
    expect(
      topResult.matchedBestFor.some(
        (b) => b.includes('photo') || b.includes('product'),
      ),
    ).toBe(true)
  })

  it('returns results sorted descending by score', () => {
    const intent: ImageIntent = { subject: 'landscape painting', style: 'oil painting' }
    const results = routeModelsForIntent(intent)

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score)
    }
  })

  it('returns at most 5 results', () => {
    const intent: ImageIntent = { subject: 'anything' }
    const results = routeModelsForIntent(intent)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('returns results with score 0 for unmatched intent (minimal intent)', () => {
    const intent: ImageIntent = { subject: 'something completely vague' }
    const results = routeModelsForIntent(intent)
    // Should still return results (defaulting to all models with score 0)
    expect(results.length).toBeGreaterThan(0)
  })

  it('includes all models with score > 0 before models with score 0', () => {
    const intent: ImageIntent = {
      subject: 'portrait',
      style: 'photorealism',
    }
    const results = routeModelsForIntent(intent)
    const firstZeroIdx = results.findIndex((r) => r.score === 0)
    if (firstZeroIdx !== -1) {
      const allBefore = results.slice(0, firstZeroIdx)
      expect(allBefore.every((r) => r.score > 0)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/services/model-router.service.test.ts --reporter=verbose
```

Expected: FAIL — `routeModelsForIntent is not exported from './model-router.service'`

- [ ] **Step 3: Implement model-router.service.ts**

Create `src/services/model-router.service.ts`:

```ts
import 'server-only'

import { MODEL_STRENGTHS } from '@/constants/model-strengths'
import type { ImageIntent } from '@/types'

export interface RecommendedModel {
  modelId: string
  score: number
  reason: string
  matchedBestFor: string[]
}

// ─── Task keyword extraction ──────────────────────────────────────

/**
 * Derive task keywords from an ImageIntent.
 * These are matched against model bestFor[] arrays.
 */
function extractTaskKeywords(intent: ImageIntent): string[] {
  const keywords: string[] = []

  if (intent.style) {
    const style = intent.style.toLowerCase()
    if (style.includes('photo') || style.includes('realis')) {
      keywords.push('photorealistic', 'portrait', 'product', 'architecture')
    }
    if (style.includes('anime') || style.includes('manga') || style.includes('cartoon')) {
      keywords.push('anime', 'illustration')
    }
    if (style.includes('paint') || style.includes('art') || style.includes('illustrat')) {
      keywords.push('artistic', 'creative', 'concept')
    }
  }

  if (intent.subject) {
    const sub = intent.subject.toLowerCase()
    if (sub.includes('product') || sub.includes('logo') || sub.includes('commercial')) {
      keywords.push('product')
    }
    if (sub.includes('portrait') || sub.includes('person') || sub.includes('woman') || sub.includes('man')) {
      keywords.push('portrait')
    }
    if (sub.includes('landscape') || sub.includes('architecture') || sub.includes('building')) {
      keywords.push('architecture')
    }
  }

  if (intent.referenceAssets && intent.referenceAssets.length > 0) {
    keywords.push('reference')
  }

  // Mood → keywords
  if (intent.mood) {
    const mood = intent.mood.toLowerCase()
    if (mood.includes('dramatic') || mood.includes('moody')) {
      keywords.push('portrait')
    }
  }

  return [...new Set(keywords)]
}

// ─── Scorer ──────────────────────────────────────────────────────

function scoreModel(
  modelId: string,
  taskKeywords: string[],
): { score: number; matchedBestFor: string[]; reason: string } {
  const strengths = MODEL_STRENGTHS[modelId as keyof typeof MODEL_STRENGTHS]

  if (!strengths) {
    return { score: 0, matchedBestFor: [], reason: 'No strength data for this model.' }
  }

  const matched = strengths.bestFor.filter((bestForItem) =>
    taskKeywords.some(
      (kw) =>
        bestForItem.toLowerCase().includes(kw) ||
        kw.includes(bestForItem.toLowerCase()),
    ),
  )

  const score = matched.length

  const reason =
    matched.length > 0
      ? `Matches: ${matched.join(', ')}.`
      : `No direct task match; general-purpose fallback.`

  return { score, matchedBestFor: matched, reason }
}

// ─── Service ─────────────────────────────────────────────────────

/**
 * Route an ImageIntent to the best-fit models using static strength data.
 * Returns up to 5 models sorted by descending score.
 * Pure function — no I/O.
 */
export function routeModelsForIntent(intent: ImageIntent): RecommendedModel[] {
  const taskKeywords = extractTaskKeywords(intent)

  const scored: RecommendedModel[] = Object.keys(MODEL_STRENGTHS).map(
    (modelId) => {
      const { score, matchedBestFor, reason } = scoreModel(modelId, taskKeywords)
      return { modelId, score, matchedBestFor, reason }
    },
  )

  return scored.sort((a, b) => b.score - a.score).slice(0, 5)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/services/model-router.service.test.ts --reporter=verbose
```

Expected: All 6 tests PASS

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/model-router.service.ts \
        src/services/model-router.service.test.ts
git commit -m "feat(services): add model-router.service — static bestFor scoring for intent routing (Round-1)"
```

---

## Task 4: Add GENERATION_PLAN to API_ENDPOINTS constant

**Files:**
- Modify: `src/constants/config.ts`

This must happen BEFORE the route file and api-client function reference the constant.

- [ ] **Step 1: Add endpoint constant**

In `src/constants/config.ts`, find `API_ENDPOINTS` object and append:

```ts
export const API_ENDPOINTS = {
  // ... existing entries ...
  GENERATION_PLAN: '/api/generation/plan',
} as const
```

- [ ] **Step 2: Verify constant is accessible**

```bash
grep -n "GENERATION_PLAN" src/constants/config.ts
```

Expected: Line shows the new constant

- [ ] **Step 3: Commit**

```bash
git add src/constants/config.ts
git commit -m "feat(constants): add GENERATION_PLAN API endpoint constant"
```

---

## Task 5: Create POST /api/generation/plan route

**Files:**
- Create: `src/app/api/generation/plan/route.ts`
- Create: `src/app/api/generation/plan/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/generation/plan/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuthenticatedRequest, createUnauthenticatedRequest } from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockParseIntent = vi.fn()
const mockRouteModels = vi.fn()

vi.mock('@/services/intent-parser.service', () => ({
  parseImageIntent: (...args: unknown[]) => mockParseIntent(...args),
}))

vi.mock('@/services/model-router.service', () => ({
  routeModelsForIntent: (...args: unknown[]) => mockRouteModels(...args),
}))

import { POST } from './route'

const SAMPLE_INTENT = {
  subject: 'a woman',
  style: 'photorealism',
}

const SAMPLE_MODELS = [
  {
    modelId: 'flux-2-pro',
    score: 2,
    reason: 'Matches: photorealistic, portrait.',
    matchedBestFor: ['photorealistic', 'portrait'],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockParseIntent.mockResolvedValue(SAMPLE_INTENT)
  mockRouteModels.mockReturnValue(SAMPLE_MODELS)
})

describe('POST /api/generation/plan', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const req = createUnauthenticatedRequest('POST', '/api/generation/plan', {
      naturalLanguage: 'a beautiful portrait',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when naturalLanguage is missing', async () => {
    const req = createAuthenticatedRequest('POST', '/api/generation/plan', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when naturalLanguage is empty string', async () => {
    const req = createAuthenticatedRequest('POST', '/api/generation/plan', {
      naturalLanguage: '',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with plan data on valid request', async () => {
    const req = createAuthenticatedRequest('POST', '/api/generation/plan', {
      naturalLanguage: 'a cinematic portrait',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.intent).toMatchObject({ subject: 'a woman' })
    expect(body.data.recommendedModels).toHaveLength(1)
    expect(body.data.variationCount).toBe(4)
    expect(typeof body.data.promptDraft).toBe('string')
  })

  it('calls parseImageIntent with naturalLanguage and referenceAssets', async () => {
    const req = createAuthenticatedRequest('POST', '/api/generation/plan', {
      naturalLanguage: 'a portrait',
      referenceAssets: [{ url: 'https://example.com/img.jpg', role: 'identity' }],
    })
    await POST(req)

    expect(mockParseIntent).toHaveBeenCalledWith('a portrait', [
      { url: 'https://example.com/img.jpg', role: 'identity' },
    ])
  })

  it('returns 500 when intent-parser throws unexpectedly', async () => {
    mockParseIntent.mockRejectedValue(new Error('unexpected crash'))

    const req = createAuthenticatedRequest('POST', '/api/generation/plan', {
      naturalLanguage: 'a portrait',
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/app/api/generation/plan/route.test.ts --reporter=verbose
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

Create `src/app/api/generation/plan/route.ts`:

```ts
import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { GenerationPlanRequestSchema } from '@/types'
import { logger } from '@/lib/logger'
import { parseImageIntent } from '@/services/intent-parser.service'
import { routeModelsForIntent } from '@/services/model-router.service'

// ─── POST /api/generation/plan ────────────────────────────────────

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const parsed = GenerationPlanRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
      { status: 400 },
    )
  }

  const { naturalLanguage, referenceAssets } = parsed.data

  try {
    const intent = await parseImageIntent(naturalLanguage, referenceAssets)
    const recommendedModels = routeModelsForIntent(intent)

    // Derive a simple prompt draft from the intent fields
    const promptParts = [
      intent.subject,
      intent.subjectDetails,
      intent.actionOrPose,
      intent.scene,
      intent.style ? `${intent.style} style` : undefined,
      intent.lighting,
      intent.mood ? `${intent.mood} mood` : undefined,
    ].filter(Boolean)

    const promptDraft = promptParts.join(', ')

    const negativePromptDraft =
      intent.mustAvoid && intent.mustAvoid.length > 0
        ? intent.mustAvoid.join(', ')
        : undefined

    logger.info('Generation plan created', {
      userId,
      subject: intent.subject,
      topModel: recommendedModels[0]?.modelId,
    })

    return NextResponse.json({
      success: true,
      data: {
        intent,
        recommendedModels,
        promptDraft,
        negativePromptDraft,
        variationCount: 4,
      },
    })
  } catch (err) {
    logger.error('Generation plan failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to generate plan' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 4: Run route tests to verify they pass**

```bash
npx vitest run src/app/api/generation/plan/route.test.ts --reporter=verbose
```

Expected: All 6 tests PASS

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/generation/plan/route.ts \
        src/app/api/generation/plan/route.test.ts
git commit -m "feat(api): add POST /api/generation/plan — intent parsing + model routing"
```

---

## Task 6: Add API Client Function

**Files:**
- Modify: `src/lib/api-client/generation.ts`

This is the client-side wrapper so hooks and components can call the new endpoint without `fetch` directly (CLAUDE.md hard rule: no fetch in components).

- [ ] **Step 1: Append to src/lib/api-client/generation.ts**

Add at the bottom of `src/lib/api-client/generation.ts`:

```ts
import type {
  // ... add to existing import block:
  GenerationPlanRequest,
  GenerationPlanResponse,
} from '@/types'

export async function requestGenerationPlan(
  params: GenerationPlanRequest,
): Promise<{ success: true; data: GenerationPlanResponse } | { success: false; error: string }> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_PLAN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Generation plan failed with status ${response.status}`,
        ),
      }
    }

    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: getErrorPayload(error, 'Failed to fetch generation plan'),
    }
  }
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: All tests PASS (total count increases by ~28 from all new test files)

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-client/generation.ts
git commit -m "feat(api-client): add requestGenerationPlan() for POST /api/generation/plan"
```

---

## Acceptance Checklist

- [ ] `src/types/intent-schema.test.ts` — ≥ 10 cases PASS (ReferenceAsset + ImageIntent valid/invalid)
- [ ] `src/services/intent-parser.service.test.ts` — ≥ 6 cases PASS (happy path / invalid JSON / LLM throw / refs / wrong schema / markdown fences)
- [ ] `src/services/model-router.service.test.ts` — ≥ 6 cases PASS (non-empty / photorealism top / sorted / max 5 / minimal / score order)
- [ ] `src/app/api/generation/plan/route.test.ts` — ≥ 6 cases PASS (auth / missing field / empty / success / refs forwarded / 500)
- [ ] `src/types/index.ts` — existing exports unchanged; 4 new exports appended
- [ ] `src/constants/config.ts` — `API_ENDPOINTS.GENERATION_PLAN` present
- [ ] `src/lib/api-client/generation.ts` — `requestGenerationPlan` exported
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run` — full suite green

## What Comes Next (not in this plan)

- **B.1.2**: `prompt-compiler.service.ts` — compile `ImageIntent + modelId` → final prompt string using `model-strengths.ts` prompt style rules
- **B.1.4**: `generation-evaluator.service.ts` — LLM vision comparison of result vs intent
- **B.1.5**: `StudioGenerationPlan.tsx` — UI to show the plan card before submitting; `studio-context.tsx` gets `currentIntent` / `currentPlan` state
- **B.1.6**: `Recipe` Prisma model + CRUD; Profile/Library "我的配方" tab
