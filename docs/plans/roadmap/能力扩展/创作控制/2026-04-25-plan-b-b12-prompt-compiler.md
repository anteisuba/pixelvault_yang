# Plan B B.1.2 — Prompt Compiler (Per-Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, synchronous `compilePrompt(intent, modelId)` service that translates a structured `ImageIntent` into a model-specific prompt string — danbooru tags for NovelAI, photographic prose for FLUX, and natural language for everything else — then wire it into the `/api/generation/plan` route, replacing its inline `buildPromptDraft` helper.

**Architecture:** `prompt-compiler.service.ts` is a pure module with no I/O, no LLM calls, and no DB access. It reads `promptStyle` and `bestFor[]` from the existing `MODEL_STRENGTHS` constant and dispatches to one of three strategy functions (`compileTagBased`, `compilePhotorealistic`, `compileNaturalLanguage`). The `/api/generation/plan` route replaces its two local helper functions with calls to this service, passing the top-ranked model's ID.

**Tech Stack:** TypeScript · `ImageIntent` from `@/types` · `MODEL_STRENGTHS` + `AI_MODELS` from `@/constants` · Vitest

---

## Context: What Already Exists

Before starting, read these files to understand the surrounding system:

- `src/services/model-router.service.ts` — produces `RecommendedModel[]` sorted by score; `[0].modelId` is the top pick fed to the compiler
- `src/services/prompt-enhance.service.ts` — enhances an existing prompt string via LLM; this service is DIFFERENT and keeps running unchanged
- `src/services/recipe-compiler.service.ts` — compiles from Card objects via LLM fusion; this service is also DIFFERENT and unrelated
- `src/constants/model-strengths.ts` — provides `MODEL_STRENGTHS[modelId].promptStyle` (`'tag-based' | 'natural-language'`) and `MODEL_STRENGTHS[modelId].bestFor[]`
- `src/app/api/generation/plan/route.ts` — currently has inline `buildPromptDraft` and `buildNegativePromptDraft` functions that will be replaced

**Model IDs used in tests (actual enum string values):**
- `'flux-2-pro'` → `promptStyle: 'natural-language'`, `bestFor: ['photorealistic', ...]` → photorealistic branch
- `'nai-diffusion-4-full'` → `promptStyle: 'tag-based'` → tag-based branch
- `'gemini-3.1-flash-image-preview'` → `promptStyle: 'natural-language'`, `bestFor: ['general', ...]` → natural-language fallback

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/services/prompt-compiler.service.ts` | Pure `compilePrompt` + `compileNegativePrompt`, three strategy functions |
| Create | `src/services/prompt-compiler.service.test.ts` | 12 test cases covering all branches and negative prompt assembly |
| Modify | `src/app/api/generation/plan/route.ts` | Remove inline helpers; import and call compiler service |
| Modify | `src/app/api/generation/plan/route.test.ts` | Add compiler mock; add delegation assertion |

---

### Task 1: prompt-compiler service (pure, no I/O)

**Files:**
- Create: `src/services/prompt-compiler.service.ts`
- Create: `src/services/prompt-compiler.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/prompt-compiler.service.test.ts` with the exact content below:

```ts
import { describe, it, expect } from 'vitest'

import { compilePrompt, compileNegativePrompt } from '@/services/prompt-compiler.service'
import type { ImageIntent } from '@/types'

const MINIMAL_INTENT: ImageIntent = { subject: 'a cat' }

const FULL_INTENT: ImageIntent = {
  subject: 'a young woman',
  subjectDetails: 'long dark hair, red coat',
  actionOrPose: 'standing in rain',
  scene: 'Tokyo street at night',
  composition: 'close-up portrait',
  camera: '85mm f/1.8 lens',
  lighting: 'neon reflections',
  colorPalette: 'cyan and magenta',
  style: 'photorealism',
  mood: 'melancholic',
  mustInclude: ['umbrella'],
  mustAvoid: ['logo', 'text'],
}

// ── Tag-based strategy (NovelAI V4) ─────────────────────────────

describe('compilePrompt — tag-based (nai-diffusion-4-full)', () => {
  const MODEL = 'nai-diffusion-4-full'

  it('starts with quality tags', () => {
    const result = compilePrompt(MINIMAL_INTENT, MODEL)
    expect(result).toMatch(/^masterpiece/)
  })

  it('converts subject to underscore_format tag', () => {
    const result = compilePrompt(MINIMAL_INTENT, MODEL)
    expect(result).toContain('a_cat')
  })

  it('converts multi-word fields to underscore tags', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('a_young_woman')
    expect(result).toContain('standing_in_rain')
  })

  it('includes mustInclude items', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('umbrella')
  })

  it('does NOT include mustAvoid items in the prompt', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).not.toContain('logo')
  })
})

// ── Photorealistic strategy (FLUX Pro) ───────────────────────────

describe('compilePrompt — photorealistic (flux-2-pro)', () => {
  const MODEL = 'flux-2-pro'

  it('includes subject in natural language (no underscore conversion)', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('a young woman')
  })

  it('includes camera and lighting details verbatim', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('85mm f/1.8 lens')
    expect(result).toContain('neon reflections')
  })

  it('appends "color grading" to colorPalette', () => {
    const result = compilePrompt(FULL_INTENT, MODEL)
    expect(result).toContain('cyan and magenta color grading')
  })

  it('handles minimal intent without crashing', () => {
    const result = compilePrompt(MINIMAL_INTENT, MODEL)
    expect(result).toContain('a cat')
    expect(typeof result).toBe('string')
  })
})

// ── Natural-language fallback (Gemini / unknown model) ──────────

describe('compilePrompt — natural language (gemini-3.1-flash-image-preview)', () => {
  it('includes subject in prose', () => {
    const result = compilePrompt(FULL_INTENT, 'gemini-3.1-flash-image-preview')
    expect(result).toContain('a young woman')
  })

  it('includes style field', () => {
    const result = compilePrompt(FULL_INTENT, 'gemini-3.1-flash-image-preview')
    expect(result).toContain('photorealism')
  })

  it('falls back gracefully for an unknown modelId', () => {
    const result = compilePrompt(MINIMAL_INTENT, 'totally-unknown-model-xyz')
    expect(result).toContain('a cat')
    expect(typeof result).toBe('string')
  })
})

// ── compileNegativePrompt ────────────────────────────────────────

describe('compileNegativePrompt', () => {
  it('returns undefined when mustAvoid is absent and model is not tag-based', () => {
    const result = compileNegativePrompt(MINIMAL_INTENT, 'gemini-3.1-flash-image-preview')
    expect(result).toBeUndefined()
  })

  it('returns quality downgrade tags for tag-based model even with no mustAvoid', () => {
    const result = compileNegativePrompt(MINIMAL_INTENT, 'nai-diffusion-4-full')
    expect(result).toBeDefined()
    expect(result).toContain('worst quality')
  })

  it('includes mustAvoid items for natural-language model', () => {
    const result = compileNegativePrompt(FULL_INTENT, 'gemini-3.1-flash-image-preview')
    expect(result).toContain('logo')
    expect(result).toContain('text')
  })

  it('includes both quality tags and mustAvoid items for tag-based model', () => {
    const result = compileNegativePrompt(FULL_INTENT, 'nai-diffusion-4-full')
    expect(result).toContain('worst quality')
    expect(result).toContain('logo')
  })
})
```

- [ ] **Step 2: Run tests to verify they all fail**

```bash
npx vitest run src/services/prompt-compiler.service.test.ts --reporter=verbose
```

Expected: all 12 tests FAIL with `Cannot find module '@/services/prompt-compiler.service'`

- [ ] **Step 3: Implement the service**

Create `src/services/prompt-compiler.service.ts` with the exact content below:

```ts
import 'server-only'

import { MODEL_STRENGTHS } from '@/constants/model-strengths'
import { AI_MODELS } from '@/constants/models'
import type { ImageIntent } from '@/types'

const TAG_QUALITY_PREFIX = 'masterpiece, best quality, highres'
const TAG_NEGATIVE_QUALITY =
  'worst quality, low quality, blurry, text, watermark, signature'

function toTag(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '_')
}

function compileTagBased(intent: ImageIntent): string {
  const tags: string[] = [TAG_QUALITY_PREFIX]

  tags.push(toTag(intent.subject))
  if (intent.subjectDetails) tags.push(toTag(intent.subjectDetails))
  if (intent.actionOrPose) tags.push(toTag(intent.actionOrPose))
  if (intent.scene) tags.push(toTag(intent.scene))
  if (intent.style) tags.push(toTag(intent.style))
  if (intent.composition) tags.push(toTag(intent.composition))
  if (intent.lighting) tags.push(toTag(intent.lighting))
  if (intent.colorPalette) tags.push(toTag(intent.colorPalette))
  if (intent.mood) tags.push(toTag(intent.mood))
  if (intent.mustInclude) {
    for (const item of intent.mustInclude) tags.push(toTag(item))
  }

  return tags.join(', ')
}

function compilePhotorealistic(intent: ImageIntent): string {
  const parts: string[] = []

  const subject = [intent.subject, intent.subjectDetails]
    .filter(Boolean)
    .join(', ')
  parts.push(subject)

  if (intent.actionOrPose) parts.push(intent.actionOrPose)
  if (intent.scene) parts.push(`in ${intent.scene}`)
  if (intent.camera) parts.push(intent.camera)
  if (intent.lighting) parts.push(intent.lighting)
  if (intent.colorPalette) parts.push(`${intent.colorPalette} color grading`)
  if (intent.mood) parts.push(`${intent.mood} mood`)
  if (intent.composition) parts.push(intent.composition)
  if (intent.style) parts.push(`${intent.style} style`)
  if (intent.mustInclude) {
    for (const item of intent.mustInclude) parts.push(item)
  }

  return parts.join(', ')
}

function compileNaturalLanguage(intent: ImageIntent): string {
  const parts: string[] = []

  if (intent.style) parts.push(`${intent.style} style`)
  const subject = [intent.subject, intent.subjectDetails]
    .filter(Boolean)
    .join(', ')
  parts.push(subject)
  if (intent.actionOrPose) parts.push(intent.actionOrPose)
  if (intent.scene) parts.push(intent.scene)
  if (intent.composition) parts.push(intent.composition)
  if (intent.camera) parts.push(intent.camera)
  if (intent.lighting) parts.push(intent.lighting)
  if (intent.colorPalette) parts.push(intent.colorPalette)
  if (intent.mood) parts.push(`${intent.mood} mood`)
  if (intent.mustInclude) {
    for (const item of intent.mustInclude) parts.push(item)
  }

  return parts.join(', ')
}

/**
 * Compile a model-specific prompt string from structured intent.
 * Pure function — no I/O, no LLM, no DB.
 *
 * Strategy dispatch:
 *   tag-based models (NovelAI)   → danbooru-style comma-separated tags
 *   photorealistic models (FLUX) → photographic prose with camera/lighting terminology
 *   everything else              → natural language description
 */
export function compilePrompt(intent: ImageIntent, modelId: string): string {
  const strength = MODEL_STRENGTHS[modelId as AI_MODELS]

  if (strength?.promptStyle === 'tag-based') {
    return compileTagBased(intent)
  }

  if (strength?.bestFor.includes('photorealistic')) {
    return compilePhotorealistic(intent)
  }

  return compileNaturalLanguage(intent)
}

/**
 * Compile a negative prompt from intent.mustAvoid and model strategy.
 * Returns undefined when there is nothing to negate.
 */
export function compileNegativePrompt(
  intent: ImageIntent,
  modelId: string,
): string | undefined {
  const strength = MODEL_STRENGTHS[modelId as AI_MODELS]
  const isTagBased = strength?.promptStyle === 'tag-based'
  const parts: string[] = []

  if (isTagBased) {
    parts.push(TAG_NEGATIVE_QUALITY)
  }

  if (intent.mustAvoid && intent.mustAvoid.length > 0) {
    const formatted = isTagBased
      ? intent.mustAvoid.map(toTag)
      : intent.mustAvoid
    parts.push(...formatted)
  }

  return parts.length > 0 ? parts.join(', ') : undefined
}
```

- [ ] **Step 4: Run tests to verify all 12 pass**

```bash
npx vitest run src/services/prompt-compiler.service.test.ts --reporter=verbose
```

Expected: 12/12 PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/prompt-compiler.service.ts src/services/prompt-compiler.service.test.ts
git commit -m "feat(plan-b): add prompt-compiler service with tag/photo/natural-language strategies"
```

---

### Task 2: Wire compiler into the /api/generation/plan route

**Files:**
- Modify: `src/app/api/generation/plan/route.test.ts`
- Modify: `src/app/api/generation/plan/route.ts`

**Pre-read:** Open `src/app/api/generation/plan/route.test.ts` and confirm it currently has `mockParseIntent`, `mockRouteModels`, and a `beforeEach` that sets up mocks for those two services. The test file has 6 tests total.

- [ ] **Step 1: Update the route test**

Replace the mock declaration block and `beforeEach` in `src/app/api/generation/plan/route.test.ts`.

The current mock block looks like:

```ts
const mockParseIntent = vi.fn()
const mockRouteModels = vi.fn()

vi.mock('@/services/intent-parser.service', () => ({
  parseImageIntent: (...args: unknown[]) => mockParseIntent(...args),
}))

vi.mock('@/services/model-router.service', () => ({
  routeModelsForIntent: (...args: unknown[]) => mockRouteModels(...args),
}))
```

Replace it with (add two more mocks for the compiler):

```ts
const mockParseIntent = vi.fn()
const mockRouteModels = vi.fn()
const mockCompilePrompt = vi.fn()
const mockCompileNegativePrompt = vi.fn()

vi.mock('@/services/intent-parser.service', () => ({
  parseImageIntent: (...args: unknown[]) => mockParseIntent(...args),
}))

vi.mock('@/services/model-router.service', () => ({
  routeModelsForIntent: (...args: unknown[]) => mockRouteModels(...args),
}))

vi.mock('@/services/prompt-compiler.service', () => ({
  compilePrompt: (...args: unknown[]) => mockCompilePrompt(...args),
  compileNegativePrompt: (...args: unknown[]) => mockCompileNegativePrompt(...args),
}))
```

The current `beforeEach` looks like:

```ts
beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockParseIntent.mockResolvedValue(SAMPLE_INTENT)
  mockRouteModels.mockReturnValue(SAMPLE_MODELS)
})
```

Replace it with (add defaults for the new mocks):

```ts
beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockParseIntent.mockResolvedValue(SAMPLE_INTENT)
  mockRouteModels.mockReturnValue(SAMPLE_MODELS)
  mockCompilePrompt.mockReturnValue('compiled prompt')
  mockCompileNegativePrompt.mockReturnValue(undefined)
})
```

Then add one new test case at the end of the `describe` block (after the existing 6 tests):

```ts
  it('calls compilePrompt with the top-ranked model id', async () => {
    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a cinematic portrait',
    })
    await POST(req)
    expect(mockCompilePrompt).toHaveBeenCalledWith(
      SAMPLE_INTENT,
      SAMPLE_MODELS[0].modelId,
    )
  })
```

- [ ] **Step 2: Run the test file to verify the new test fails (and old tests still pass)**

```bash
npx vitest run src/app/api/generation/plan/route.test.ts --reporter=verbose
```

Expected: 6 existing tests PASS, 1 new test FAIL (route still uses `buildPromptDraft` not the compiler)

- [ ] **Step 3: Update the route implementation**

Replace `src/app/api/generation/plan/route.ts` with the full content below (removes `buildPromptDraft`, `buildNegativePromptDraft`, and the unused `ImageIntent` import; adds compiler imports):

```ts
import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerationPlanRequestSchema,
  type GenerationPlanResponse,
} from '@/types'
import { parseImageIntent } from '@/services/intent-parser.service'
import { routeModelsForIntent } from '@/services/model-router.service'
import {
  compilePrompt,
  compileNegativePrompt,
} from '@/services/prompt-compiler.service'

export const POST = createApiRoute<
  typeof GenerationPlanRequestSchema,
  GenerationPlanResponse
>({
  schema: GenerationPlanRequestSchema,
  routeName: 'POST /api/generation/plan',
  handler: async (_clerkId, data) => {
    const intent = await parseImageIntent(
      data.naturalLanguage,
      data.referenceAssets,
    )
    const recommendedModels = routeModelsForIntent(intent)
    const topModelId = recommendedModels[0]?.modelId ?? ''

    return {
      intent,
      recommendedModels,
      promptDraft: compilePrompt(intent, topModelId),
      negativePromptDraft: compileNegativePrompt(intent, topModelId),
      variationCount: 4,
    }
  },
})
```

- [ ] **Step 4: Run the full route test suite — all 7 must pass**

```bash
npx vitest run src/app/api/generation/plan/route.test.ts --reporter=verbose
```

Expected: 7/7 PASS

- [ ] **Step 5: Run all services tests to check for regressions**

```bash
npx vitest run src/services/ --reporter=verbose
```

Expected: all passing, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/app/api/generation/plan/route.ts src/app/api/generation/plan/route.test.ts
git commit -m "feat(plan-b): wire prompt-compiler into generation plan route"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** `compilePrompt` with tag-based / photorealistic / natural-language branches ✅ · `compileNegativePrompt` with model-aware quality tags ✅ · `/api/generation/plan` route updated ✅ · backward compatibility: `/api/generate` is untouched ✅
- [x] **No placeholders:** All code blocks are complete and runnable
- [x] **Type consistency:** `compilePrompt(intent: ImageIntent, modelId: string): string` and `compileNegativePrompt(intent: ImageIntent, modelId: string): string | undefined` used identically in service, tests, and route
- [x] **Model IDs verified:** `'flux-2-pro'`, `'nai-diffusion-4-full'`, `'gemini-3.1-flash-image-preview'` confirmed against `src/constants/models.ts` AI_MODELS enum values

## Verification Contract

After both tasks complete:

```bash
npx vitest run src/services/prompt-compiler.service.test.ts --reporter=verbose
# Expected: 12/12 PASS

npx vitest run src/app/api/generation/plan/route.test.ts --reporter=verbose
# Expected: 7/7 PASS

npx tsc --noEmit
# Expected: 0 errors
```
