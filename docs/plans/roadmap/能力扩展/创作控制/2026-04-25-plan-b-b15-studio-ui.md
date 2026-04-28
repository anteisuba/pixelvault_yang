# Plan B B.1.5 — Studio UI: GenerationPlan + ResultFeedback + KeepChangePanel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new Studio UI components for the creative-control feedback loop: `StudioGenerationPlan` (pre-generation plan review dialog), `StudioResultFeedback` (post-generation 5-button rating bar), and `StudioKeepChangePanel` (keep/change refinement panel). Wire them into the existing Studio canvas flow without touching the Studio context reducer or generation orchestrator.

**Architecture overview:**
- `StudioGenerationPlan` — Dialog intercepting the Generate button in `StudioPromptArea`. Calls `POST /api/generation/plan`, shows recommended models + compiledPrompt + cost. On confirm, passes chosen model + prompt into existing `generate()`.
- `StudioResultFeedback` — Rendered below `GenerationPreview` in `StudioCanvas` when `lastGeneration` is an IMAGE. Five emoji-tagged buttons (satisfied / subject / style / composition / lighting). Satisfied triggers evaluate API. Any mismatch button opens KeepChange panel.
- `StudioKeepChangePanel` — New toolbar panel (panel name `keepChange`). Multi-select chips for what to keep/change + freeform text. On confirm builds a refined prompt and triggers `generate()`.

**Critical context:**
- All 3 components live in `src/components/business/studio/`
- New api-client functions go in `src/lib/api-client/generation.ts`
- New `keepChange` panel entry must be added to `PanelName` union in `src/contexts/studio-context.tsx` **and** `initialPanels` record — grep `PanelName` to see all consumers before touching
- All i18n keys must be added to **all 3 files**: `src/messages/en.json`, `src/messages/ja.json`, `src/messages/zh.json`
- Components use context via `useStudioForm()`, `useStudioData()`, `useStudioGen()` — never call `fetch()` directly in components; use api-client
- Tests use `@testing-library/react`, mock contexts via `vi.mock('@/contexts/studio-context')`

**Risks:**
- `studio-context.tsx` is HIGH RISK (23+ consumers). Adding `keepChange` to `PanelName` only adds an optional entry — all existing TOGGLE_PANEL/OPEN_PANEL dispatches continue to work. Still: grep `PanelName` and `initialPanels` before commit.
- `StudioPromptArea.tsx` is HIGH RISK (core input). The plan dialog is added as local React state (`useState`) — no context changes, no dispatch changes.

**Out of scope:**
- Persistence of feedback tags to DB (future task — user feedback tags are currently client-side only)
- Recipe auto-save from KeepChange panel (future task)
- Any video/audio mode feedback UI (image mode only for B.1.5)

---

### Task 1: api-client functions + i18n keys

**Files:**
- Edit: `src/lib/api-client/generation.ts`
- Edit: `src/messages/en.json`
- Edit: `src/messages/ja.json`
- Edit: `src/messages/zh.json`

- [ ] **Step 1: Write the test file for api-client functions**

```typescript
// src/lib/api-client/generation-plan.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

// Import after vi.mock if needed — these are pure fetch wrappers
import { fetchGenerationPlanAPI, evaluateGenerationAPI } from '@/lib/api-client/generation'

describe('fetchGenerationPlanAPI', () => {
  it('returns plan data on 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              intent: { subject: 'cat' },
              recommendedModels: [{ modelId: 'flux-2-pro', score: 0.9, reason: 'Best for portraits', matchedBestFor: ['portrait'] }],
              promptDraft: 'a cute cat sitting on a wooden floor',
              negativePromptDraft: 'blurry, low quality',
              variationCount: 4,
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await fetchGenerationPlanAPI({ naturalLanguage: 'a cute cat' })

    expect(result.success).toBe(true)
    expect(result.data?.promptDraft).toBe('a cute cat sitting on a wooden floor')
    expect(result.data?.recommendedModels).toHaveLength(1)
  })

  it('returns error on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 })),
    )

    const result = await fetchGenerationPlanAPI({ naturalLanguage: 'cat' })

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('evaluateGenerationAPI', () => {
  it('returns evaluation data on 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              subjectMatch: 0.9,
              styleMatch: 0.8,
              compositionMatch: 0.85,
              artifactScore: 0.95,
              promptAdherence: 0.88,
              overall: 0.88,
              detectedIssues: [],
              suggestedFixes: [],
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await evaluateGenerationAPI('gen_123')

    expect(result.success).toBe(true)
    expect(result.data?.overall).toBe(0.88)
  })

  it('returns error when generation not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'Generation not found' }), { status: 404 }),
      ),
    )

    const result = await evaluateGenerationAPI('missing_gen')

    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL** (functions don't exist yet)
```bash
npx vitest run src/lib/api-client/generation-plan.test.ts --reporter=verbose
```

- [ ] **Step 3: Add api-client functions to `src/lib/api-client/generation.ts`**

Append at the end of the file (after the last existing export):

```typescript
// ── Generation Plan (B.1.5) ─────────────────────────────────────

export async function fetchGenerationPlanAPI(params: {
  naturalLanguage: string
  referenceAssets?: Array<{ url: string; role: string }>
}): Promise<{
  success: boolean
  data?: GenerationPlanResponse
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_PLAN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Plan failed with status ${response.status}`),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function evaluateGenerationAPI(generationId: string): Promise<{
  success: boolean
  data?: GenerationEvaluation
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_EVALUATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Evaluate failed with status ${response.status}`),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
```

- [ ] **Step 4: Add i18n keys to all 3 message files**

Add these keys to `src/messages/en.json` (inside the top-level JSON object, after the last existing key):
```json
"StudioGenerationPlan": {
  "title": "Generation Plan",
  "subtitle": "Review settings before generating",
  "modelsSection": "Recommended Models",
  "promptSection": "Compiled Prompt",
  "negativeSection": "Negative Prompt",
  "variationCount": "{count} variations",
  "loading": "Analyzing your prompt...",
  "loadFailed": "Could not load plan. Generate anyway?",
  "generateNow": "Generate Now",
  "cancel": "Cancel",
  "reasonLabel": "Why: {reason}"
},
"StudioResultFeedback": {
  "satisfied": "Satisfied",
  "subjectMismatch": "Subject off",
  "styleMismatch": "Style off",
  "compositionMismatch": "Composition off",
  "lightingMismatch": "Lighting off",
  "refine": "Refine",
  "scoreLabel": "Score: {score}%",
  "evaluating": "Evaluating...",
  "evalFailed": "Evaluation unavailable"
},
"StudioKeepChangePanel": {
  "title": "Keep & Change",
  "keepLabel": "Keep",
  "changeLabel": "Change",
  "subject": "Subject",
  "style": "Style",
  "composition": "Composition",
  "lighting": "Lighting",
  "color": "Color",
  "freeformLabel": "Additional instructions",
  "freeformPlaceholder": "What else should change?",
  "generateRefined": "Generate Refined",
  "cancel": "Cancel"
}
```

Add to `src/messages/ja.json`:
```json
"StudioGenerationPlan": {
  "title": "生成プラン",
  "subtitle": "生成前に設定を確認",
  "modelsSection": "推奨モデル",
  "promptSection": "コンパイル済みプロンプト",
  "negativeSection": "ネガティブプロンプト",
  "variationCount": "{count}バリエーション",
  "loading": "プロンプトを分析中...",
  "loadFailed": "プランを読み込めませんでした。このまま生成しますか？",
  "generateNow": "今すぐ生成",
  "cancel": "キャンセル",
  "reasonLabel": "理由: {reason}"
},
"StudioResultFeedback": {
  "satisfied": "満足",
  "subjectMismatch": "主体がズレ",
  "styleMismatch": "スタイルがズレ",
  "compositionMismatch": "構図がズレ",
  "lightingMismatch": "光がズレ",
  "refine": "改善",
  "scoreLabel": "スコア: {score}%",
  "evaluating": "評価中...",
  "evalFailed": "評価できません"
},
"StudioKeepChangePanel": {
  "title": "保留と変更",
  "keepLabel": "保留",
  "changeLabel": "変更",
  "subject": "主体",
  "style": "スタイル",
  "composition": "構図",
  "lighting": "光",
  "color": "色",
  "freeformLabel": "追加の指示",
  "freeformPlaceholder": "他に変えたいことは？",
  "generateRefined": "改善版を生成",
  "cancel": "キャンセル"
}
```

Add to `src/messages/zh.json`:
```json
"StudioGenerationPlan": {
  "title": "生成计划",
  "subtitle": "生成前确认设置",
  "modelsSection": "推荐模型",
  "promptSection": "编译后提示词",
  "negativeSection": "负向提示词",
  "variationCount": "{count} 个变体",
  "loading": "正在分析提示词...",
  "loadFailed": "无法加载计划，直接生成？",
  "generateNow": "立即生成",
  "cancel": "取消",
  "reasonLabel": "原因：{reason}"
},
"StudioResultFeedback": {
  "satisfied": "满意",
  "subjectMismatch": "主体偏差",
  "styleMismatch": "风格偏差",
  "compositionMismatch": "构图偏差",
  "lightingMismatch": "光线偏差",
  "refine": "继续优化",
  "scoreLabel": "评分：{score}%",
  "evaluating": "正在评估...",
  "evalFailed": "评估不可用"
},
"StudioKeepChangePanel": {
  "title": "保留与改变",
  "keepLabel": "保留",
  "changeLabel": "改变",
  "subject": "主体",
  "style": "风格",
  "composition": "构图",
  "lighting": "光线",
  "color": "色彩",
  "freeformLabel": "额外说明",
  "freeformPlaceholder": "还需要改变什么？",
  "generateRefined": "生成优化版",
  "cancel": "取消"
}
```

- [ ] **Step 5: Run tests — expect PASS**
```bash
npx vitest run src/lib/api-client/generation-plan.test.ts --reporter=verbose
```

- [ ] **Step 6: Commit**
```bash
git add src/lib/api-client/generation-plan.test.ts src/lib/api-client/generation.ts src/messages/en.json src/messages/ja.json src/messages/zh.json
git commit -m "feat(b1.5): add fetchGenerationPlanAPI and evaluateGenerationAPI + i18n keys"
```

---

### Task 2: Add `keepChange` panel to studio-context + StudioKeepChangePanel component

**Files:**
- Edit: `src/contexts/studio-context.tsx` (add `keepChange` to `PanelName` union + `initialPanels`)
- Create: `src/components/business/studio/StudioKeepChangePanel.tsx`
- Create: `src/components/business/studio/StudioKeepChangePanel.test.tsx`

**Pre-task check:** Before editing `studio-context.tsx`, run:
```bash
grep -rn "PanelName\|initialPanels" src/ --include="*.ts" --include="*.tsx"
```
Expected hits: the context file itself + `StudioPanelPopovers.tsx` + `StudioPanelSheets.tsx` + `StudioToolbarPanels.tsx`. No other file should be affected by adding a new entry to the union.

- [ ] **Step 1: Write component tests first**

```typescript
// src/components/business/studio/StudioKeepChangePanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock contexts
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: vi.fn(),
  useStudioGen: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioKeepChangePanel } from './StudioKeepChangePanel'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'

const mockDispatch = vi.fn()
const mockGenerate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(useStudioForm as ReturnType<typeof vi.fn>).mockReturnValue({
    state: { prompt: 'a cat on a rooftop', outputType: 'image' },
    dispatch: mockDispatch,
  })
  ;(useStudioGen as ReturnType<typeof vi.fn>).mockReturnValue({
    generate: mockGenerate,
    isGenerating: false,
  })
})

describe('StudioKeepChangePanel', () => {
  it('renders keep and change chip groups', () => {
    render(<StudioKeepChangePanel />)

    expect(screen.getByText('keepLabel')).toBeInTheDocument()
    expect(screen.getByText('changeLabel')).toBeInTheDocument()
    // dimension chips appear in both keep and change groups
    expect(screen.getAllByText('subject')).toHaveLength(2)
  })

  it('toggles a keep chip on click', () => {
    render(<StudioKeepChangePanel />)

    const keepChips = screen.getAllByText('style')
    fireEvent.click(keepChips[0])

    // Chip should be selected (aria-pressed or class change — test for aria-pressed)
    expect(keepChips[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls dispatch CLOSE_ALL_PANELS and generate on confirm', async () => {
    render(<StudioKeepChangePanel />)

    fireEvent.click(screen.getByText('generateRefined'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLOSE_ALL_PANELS' })
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'image' }),
    )
  })

  it('cancel button dispatches CLOSE_ALL_PANELS', () => {
    render(<StudioKeepChangePanel />)

    fireEvent.click(screen.getByText('cancel'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLOSE_ALL_PANELS' })
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('disables generate button while generating', () => {
    ;(useStudioGen as ReturnType<typeof vi.fn>).mockReturnValue({
      generate: mockGenerate,
      isGenerating: true,
    })

    render(<StudioKeepChangePanel />)

    expect(screen.getByText('generateRefined').closest('button')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**
```bash
npx vitest run src/components/business/studio/StudioKeepChangePanel.test.tsx --reporter=verbose
```

- [ ] **Step 3: Add `keepChange` to studio-context.tsx**

In `src/contexts/studio-context.tsx`, find `PanelName` type (search for `'cardManagement' | 'projectHistory'`), add `'keepChange'` to the union:
```typescript
// Before:
export type PanelName = 'cardManagement' | 'projectHistory' | ... | 'voiceTrainer' | 'transform' | 'videoParams' | 'script'
// After:
export type PanelName = 'cardManagement' | 'projectHistory' | ... | 'voiceTrainer' | 'transform' | 'videoParams' | 'script' | 'keepChange'
```

In `initialPanels`, add:
```typescript
keepChange: false,
```

- [ ] **Step 4: Create StudioKeepChangePanel.tsx**

```typescript
// src/components/business/studio/StudioKeepChangePanel.tsx
'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import type { UnifiedGenerateInput } from '@/hooks/use-unified-generate'

type Dimension = 'subject' | 'style' | 'composition' | 'lighting' | 'color'
const DIMENSIONS: Dimension[] = ['subject', 'style', 'composition', 'lighting', 'color']

export function StudioKeepChangePanel() {
  const { state, dispatch } = useStudioForm()
  const { generate, isGenerating } = useStudioGen()
  const t = useTranslations('StudioKeepChangePanel')

  const [keepSet, setKeepSet] = useState<Set<Dimension>>(new Set())
  const [changeSet, setChangeSet] = useState<Set<Dimension>>(new Set())
  const [freeform, setFreeform] = useState('')

  const toggleKeep = useCallback((dim: Dimension) => {
    setKeepSet((prev) => {
      const next = new Set(prev)
      if (next.has(dim)) next.delete(dim)
      else next.add(dim)
      return next
    })
    // Keep and change are mutually exclusive
    setChangeSet((prev) => {
      const next = new Set(prev)
      next.delete(dim)
      return next
    })
  }, [])

  const toggleChange = useCallback((dim: Dimension) => {
    setChangeSet((prev) => {
      const next = new Set(prev)
      if (next.has(dim)) next.delete(dim)
      else next.add(dim)
      return next
    })
    setKeepSet((prev) => {
      const next = new Set(prev)
      next.delete(dim)
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    const keepParts = keepSet.size > 0 ? `Keep ${[...keepSet].join(', ')}.` : ''
    const changeParts = changeSet.size > 0 ? `Change ${[...changeSet].join(', ')}.` : ''
    const refinementSuffix = [keepParts, changeParts, freeform].filter(Boolean).join(' ')
    const refinedPrompt = refinementSuffix
      ? `${state.prompt}. ${refinementSuffix}`
      : state.prompt

    dispatch({ type: 'CLOSE_ALL_PANELS' })

    const input: UnifiedGenerateInput = {
      mode: 'image',
      image: {
        freePrompt: refinedPrompt,
        aspectRatio: state.aspectRatio,
      },
    }
    await generate(input)
  }, [keepSet, changeSet, freeform, state.prompt, state.aspectRatio, dispatch, generate])

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_PANELS' })
  }, [dispatch])

  return (
    <div className="space-y-4 p-4">
      <p className="text-sm font-medium text-foreground">{t('title')}</p>

      {/* Keep chips */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t('keepLabel')}</p>
        <div className="flex flex-wrap gap-1.5">
          {DIMENSIONS.map((dim) => (
            <button
              key={`keep-${dim}`}
              type="button"
              aria-pressed={keepSet.has(dim)}
              onClick={() => toggleKeep(dim)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                keepSet.has(dim)
                  ? 'bg-green-100 text-green-800 ring-1 ring-green-300'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {t(dim)}
            </button>
          ))}
        </div>
      </div>

      {/* Change chips */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t('changeLabel')}</p>
        <div className="flex flex-wrap gap-1.5">
          {DIMENSIONS.map((dim) => (
            <button
              key={`change-${dim}`}
              type="button"
              aria-pressed={changeSet.has(dim)}
              onClick={() => toggleChange(dim)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                changeSet.has(dim)
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {t(dim)}
            </button>
          ))}
        </div>
      </div>

      {/* Freeform */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('freeformLabel')}</label>
        <textarea
          value={freeform}
          onChange={(e) => setFreeform(e.target.value)}
          placeholder={t('freeformPlaceholder')}
          rows={2}
          className="w-full resize-none rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-serif text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 rounded-lg border border-border/60 bg-background/60 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
            isGenerating
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground shadow-sm hover:shadow-md active:scale-[0.97]',
          )}
        >
          {t('generateRefined')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**
```bash
npx vitest run src/components/business/studio/StudioKeepChangePanel.test.tsx --reporter=verbose
```

- [ ] **Step 6: Commit**
```bash
git add src/contexts/studio-context.tsx \
  src/components/business/studio/StudioKeepChangePanel.tsx \
  src/components/business/studio/StudioKeepChangePanel.test.tsx
git commit -m "feat(b1.5): add keepChange panel to studio-context + StudioKeepChangePanel component"
```

---

### Task 3: StudioResultFeedback component

**Files:**
- Create: `src/components/business/studio/StudioResultFeedback.tsx`
- Create: `src/components/business/studio/StudioResultFeedback.test.tsx`

- [ ] **Step 1: Write component tests first**

```typescript
// src/components/business/studio/StudioResultFeedback.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: vi.fn(),
}))
vi.mock('@/lib/api-client/generation', () => ({
  evaluateGenerationAPI: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key,
}))

import { StudioResultFeedback } from './StudioResultFeedback'
import { useStudioForm } from '@/contexts/studio-context'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import type { GenerationRecord } from '@/types'

const mockDispatch = vi.fn()
const FAKE_GEN = { id: 'gen_1', url: 'https://example.com/img.png', outputType: 'IMAGE' } as GenerationRecord

beforeEach(() => {
  vi.clearAllMocks()
  ;(useStudioForm as ReturnType<typeof vi.fn>).mockReturnValue({
    dispatch: mockDispatch,
  })
})

describe('StudioResultFeedback', () => {
  it('renders 5 feedback buttons', () => {
    render(<StudioResultFeedback generation={FAKE_GEN} />)

    expect(screen.getByText('satisfied')).toBeInTheDocument()
    expect(screen.getByText('subjectMismatch')).toBeInTheDocument()
    expect(screen.getByText('styleMismatch')).toBeInTheDocument()
    expect(screen.getByText('compositionMismatch')).toBeInTheDocument()
    expect(screen.getByText('lightingMismatch')).toBeInTheDocument()
  })

  it('calls evaluateGenerationAPI on satisfied click and shows score', async () => {
    ;(evaluateGenerationAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        overall: 0.88,
        subjectMatch: 0.9,
        styleMatch: 0.85,
        compositionMatch: 0.82,
        artifactScore: 0.95,
        promptAdherence: 0.88,
        detectedIssues: [],
        suggestedFixes: [],
      },
    })

    render(<StudioResultFeedback generation={FAKE_GEN} />)
    fireEvent.click(screen.getByText('satisfied'))

    await waitFor(() => {
      expect(evaluateGenerationAPI).toHaveBeenCalledWith('gen_1')
    })
    await waitFor(() => {
      expect(screen.getByText(/scoreLabel/)).toBeInTheDocument()
    })
  })

  it('opens keepChange panel on mismatch button click', () => {
    render(<StudioResultFeedback generation={FAKE_GEN} />)

    fireEvent.click(screen.getByText('subjectMismatch'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      payload: 'keepChange',
    })
  })

  it('shows evaluating state while API is loading', async () => {
    let resolve: (v: unknown) => void
    const pending = new Promise((r) => { resolve = r })
    ;(evaluateGenerationAPI as ReturnType<typeof vi.fn>).mockReturnValue(pending)

    render(<StudioResultFeedback generation={FAKE_GEN} />)
    fireEvent.click(screen.getByText('satisfied'))

    expect(screen.getByText('evaluating')).toBeInTheDocument()

    resolve!({ success: false, error: 'fail' })
    await waitFor(() => expect(screen.queryByText('evaluating')).toBeNull())
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**
```bash
npx vitest run src/components/business/studio/StudioResultFeedback.test.tsx --reporter=verbose
```

- [ ] **Step 3: Create StudioResultFeedback.tsx**

```typescript
// src/components/business/studio/StudioResultFeedback.tsx
'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ThumbsUp, User, Palette, LayoutGrid, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStudioForm } from '@/contexts/studio-context'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import type { GenerationRecord, GenerationEvaluation } from '@/types'

interface StudioResultFeedbackProps {
  generation: GenerationRecord
}

type FeedbackTag = 'satisfied' | 'subjectMismatch' | 'styleMismatch' | 'compositionMismatch' | 'lightingMismatch'

const FEEDBACK_BUTTONS: Array<{ tag: FeedbackTag; icon: React.ComponentType<{ className?: string }> }> = [
  { tag: 'satisfied', icon: ThumbsUp },
  { tag: 'subjectMismatch', icon: User },
  { tag: 'styleMismatch', icon: Palette },
  { tag: 'compositionMismatch', icon: LayoutGrid },
  { tag: 'lightingMismatch', icon: Sun },
]

export function StudioResultFeedback({ generation }: StudioResultFeedbackProps) {
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioResultFeedback')

  const [evaluating, setEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<GenerationEvaluation | null>(null)
  const [evalError, setEvalError] = useState(false)

  const handleSatisfied = useCallback(async () => {
    if (evaluating) return
    setEvaluating(true)
    setEvalError(false)
    const result = await evaluateGenerationAPI(generation.id)
    setEvaluating(false)
    if (result.success && result.data) {
      setEvaluation(result.data)
    } else {
      setEvalError(true)
    }
  }, [generation.id, evaluating])

  const handleMismatch = useCallback(() => {
    dispatch({ type: 'OPEN_PANEL', payload: 'keepChange' })
  }, [dispatch])

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {FEEDBACK_BUTTONS.map(({ tag, icon: Icon }) => (
          <button
            key={tag}
            type="button"
            onClick={tag === 'satisfied' ? () => void handleSatisfied() : handleMismatch}
            disabled={evaluating}
            className={cn(
              'flex items-center gap-1 rounded-full border border-border/40 bg-background/80 px-3 py-1.5 text-xs transition-all',
              'hover:border-primary/30 hover:text-primary active:scale-95',
              evaluating && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Icon className="size-3" />
            {t(tag)}
          </button>
        ))}
      </div>

      {evaluating && (
        <p className="text-xs text-muted-foreground font-serif animate-pulse">{t('evaluating')}</p>
      )}

      {evaluation && !evaluating && (
        <div className="rounded-lg border border-border/40 bg-background/60 px-3 py-2">
          <p className="text-xs font-medium text-foreground">
            {t('scoreLabel', { score: Math.round(evaluation.overall * 100) })}
          </p>
          {evaluation.suggestedFixes.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {evaluation.suggestedFixes.slice(0, 2).map((fix, i) => (
                <li key={i} className="font-serif text-2xs text-muted-foreground">
                  • {fix}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {evalError && !evaluating && (
        <p className="text-xs text-muted-foreground font-serif">{t('evalFailed')}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**
```bash
npx vitest run src/components/business/studio/StudioResultFeedback.test.tsx --reporter=verbose
```

- [ ] **Step 5: Commit**
```bash
git add src/components/business/studio/StudioResultFeedback.tsx \
  src/components/business/studio/StudioResultFeedback.test.tsx
git commit -m "feat(b1.5): add StudioResultFeedback component with evaluation integration"
```

---

### Task 4: StudioGenerationPlan dialog component

**Files:**
- Create: `src/components/business/studio/StudioGenerationPlan.tsx`
- Create: `src/components/business/studio/StudioGenerationPlan.test.tsx`

- [ ] **Step 1: Write component tests first**

```typescript
// src/components/business/studio/StudioGenerationPlan.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-client/generation', () => ({
  fetchGenerationPlanAPI: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioGenerationPlan } from './StudioGenerationPlan'
import { fetchGenerationPlanAPI } from '@/lib/api-client/generation'

const MOCK_PLAN = {
  intent: { subject: 'cat' },
  recommendedModels: [
    { modelId: 'flux-2-pro', score: 0.95, reason: 'Great for portraits', matchedBestFor: ['portrait'] },
    { modelId: 'flux-schnell', score: 0.7, reason: 'Fast generation', matchedBestFor: ['general'] },
  ],
  promptDraft: 'a cute cat sitting on a wooden floor, soft lighting',
  negativePromptDraft: 'blurry, low quality',
  variationCount: 4,
}

const mockOnGenerate = vi.fn()
const mockOnClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StudioGenerationPlan', () => {
  it('shows loading state while fetching plan', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}), // never resolves
    )

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('shows plan data after successful fetch', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: MOCK_PLAN,
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('a cute cat sitting on a wooden floor, soft lighting')).toBeInTheDocument()
    })
    expect(screen.getByText('flux-2-pro')).toBeInTheDocument()
  })

  it('calls onGenerate with selected model and compiled prompt on confirm', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: MOCK_PLAN,
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => screen.getByText('generateNow'))
    fireEvent.click(screen.getByText('generateNow'))

    expect(mockOnGenerate).toHaveBeenCalledWith({
      modelId: 'flux-2-pro',
      compiledPrompt: 'a cute cat sitting on a wooden floor, soft lighting',
      negativePrompt: 'blurry, low quality',
    })
  })

  it('calls onClose on cancel button click', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: MOCK_PLAN,
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => screen.getByText('cancel'))
    fireEvent.click(screen.getByText('cancel'))

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows loadFailed and allows generate anyway on API error', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Server error',
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('loadFailed')).toBeInTheDocument()
    })
    // generateNow button still available (generates with original prompt)
    fireEvent.click(screen.getByText('generateNow'))
    expect(mockOnGenerate).toHaveBeenCalledWith({
      modelId: null,
      compiledPrompt: 'a cute cat',
      negativePrompt: undefined,
    })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**
```bash
npx vitest run src/components/business/studio/StudioGenerationPlan.test.tsx --reporter=verbose
```

- [ ] **Step 3: Create StudioGenerationPlan.tsx**

```typescript
// src/components/business/studio/StudioGenerationPlan.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { fetchGenerationPlanAPI } from '@/lib/api-client/generation'
import type { GenerationPlanResponse } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface GenerationPlanResult {
  modelId: string | null
  compiledPrompt: string
  negativePrompt?: string
}

interface StudioGenerationPlanProps {
  open: boolean
  prompt: string
  onGenerate: (result: GenerationPlanResult) => void
  onClose: () => void
}

export function StudioGenerationPlan({
  open,
  prompt,
  onGenerate,
  onClose,
}: StudioGenerationPlanProps) {
  const t = useTranslations('StudioGenerationPlan')

  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<GenerationPlanResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [editedPrompt, setEditedPrompt] = useState(prompt)

  useEffect(() => {
    if (!open || !prompt.trim()) return
    setLoading(true)
    setFailed(false)
    setPlan(null)
    setEditedPrompt(prompt)

    void fetchGenerationPlanAPI({ naturalLanguage: prompt }).then((result) => {
      setLoading(false)
      if (result.success && result.data) {
        setPlan(result.data)
        setSelectedModelId(result.data.recommendedModels[0]?.modelId ?? null)
        setEditedPrompt(result.data.promptDraft)
      } else {
        setFailed(true)
      }
    })
  }, [open, prompt])

  const handleGenerate = useCallback(() => {
    onGenerate({
      modelId: selectedModelId,
      compiledPrompt: editedPrompt,
      negativePrompt: plan?.negativePromptDraft,
    })
  }, [selectedModelId, editedPrompt, plan, onGenerate])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base">{t('title')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </DialogHeader>

        {loading && (
          <p className="py-6 text-center font-serif text-sm text-muted-foreground animate-pulse">
            {t('loading')}
          </p>
        )}

        {failed && !loading && (
          <p className="font-serif text-sm text-muted-foreground">{t('loadFailed')}</p>
        )}

        {plan && !loading && (
          <div className="space-y-4">
            {/* Model selection */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('modelsSection')}</p>
              <div className="space-y-1">
                {plan.recommendedModels.slice(0, 3).map((m) => (
                  <button
                    key={m.modelId}
                    type="button"
                    onClick={() => setSelectedModelId(m.modelId)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left text-xs transition-all',
                      selectedModelId === m.modelId
                        ? 'border-primary/30 bg-primary/5 text-foreground'
                        : 'border-border/40 bg-background/60 text-muted-foreground hover:border-primary/20',
                    )}
                  >
                    <span className="font-medium">{m.modelId}</span>
                    <span className="ml-2 text-muted-foreground/70">{t('reasonLabel', { reason: m.reason })}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Compiled prompt (editable) */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t('promptSection')}</p>
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-serif text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>

            {/* Negative prompt (read-only preview) */}
            {plan.negativePromptDraft && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('negativeSection')}</p>
                <p className="font-serif text-xs text-muted-foreground/80 leading-relaxed">
                  {plan.negativePromptDraft}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border/60 bg-background/60 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className={cn(
              'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
              loading
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground shadow-sm hover:shadow-md active:scale-[0.97]',
            )}
          >
            {t('generateNow')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**
```bash
npx vitest run src/components/business/studio/StudioGenerationPlan.test.tsx --reporter=verbose
```

- [ ] **Step 5: Commit**
```bash
git add src/components/business/studio/StudioGenerationPlan.tsx \
  src/components/business/studio/StudioGenerationPlan.test.tsx
git commit -m "feat(b1.5): add StudioGenerationPlan dialog with model recommendation + prompt editing"
```

---

### Task 5: Integration wiring

**Files to edit (high-risk — follow Change Safety Protocol):**
- `src/components/business/studio/StudioCanvas.tsx` — add `StudioResultFeedback` below `GenerationPreview`
- `src/components/business/studio/StudioPanelPopovers.tsx` — render `StudioKeepChangePanel` for `keepChange` panel
- `src/components/business/studio/StudioPanelSheets.tsx` — render `StudioKeepChangePanel` for `keepChange` panel

**StudioPromptArea.tsx integration is optional for this task** — the generation plan feature is behind a UI toggle. If not wired, the plan dialog is unreachable but no regressions occur. Wire it in as a follow-up if time allows.

**Pre-task check:**
```bash
grep -n "OPEN_PANEL\|PanelName\|keepChange" src/components/business/studio/StudioPanelPopovers.tsx
grep -n "OPEN_PANEL\|PanelName\|keepChange" src/components/business/studio/StudioPanelSheets.tsx
```

- [ ] **Step 1: Read target files before editing**

Read `StudioPanelPopovers.tsx` and `StudioPanelSheets.tsx` to understand existing panel rendering pattern.

- [ ] **Step 2: Add StudioResultFeedback to StudioCanvas**

In `StudioCanvas.tsx`, after the closing `</GenerationPreview>` (inside the `else` branch), add:

```typescript
import { StudioResultFeedback } from './StudioResultFeedback'

// ... inside JSX, below GenerationPreview:
{lastGeneration?.outputType === 'IMAGE' && (
  <StudioResultFeedback generation={lastGeneration} />
)}
```

- [ ] **Step 3: Add keepChange to StudioPanelPopovers and StudioPanelSheets**

In each panel rendering file, follow the existing pattern for other panels (look for how `enhance` or `advanced` panels are conditionally rendered), and add:

```typescript
import { StudioKeepChangePanel } from './StudioKeepChangePanel'

// Inside the panel switch / condition block:
{state.panels.keepChange && (
  <StudioKeepChangePanel />
)}
```

- [ ] **Step 4: Run full regression test suite**
```bash
npx vitest run --reporter=verbose
```

Expected: all previous tests pass + no new failures.

- [ ] **Step 5: Commit**
```bash
git add src/components/business/studio/StudioCanvas.tsx \
  src/components/business/studio/StudioPanelPopovers.tsx \
  src/components/business/studio/StudioPanelSheets.tsx
git commit -m "feat(b1.5): wire StudioResultFeedback into canvas and StudioKeepChangePanel into panel system"
```

---

## Verification Checklist

After all 5 tasks:

- [ ] `npx vitest run --reporter=verbose` — all tests pass (≥ 463 + ~20 new = ≥ 483)
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npx next lint` — no lint errors
- [ ] `PanelName` union now includes `keepChange` and `initialPanels` has `keepChange: false`
- [ ] `fetchGenerationPlanAPI` and `evaluateGenerationAPI` are exported from `@/lib/api-client/generation`
- [ ] All 3 message files (en/ja/zh) have `StudioGenerationPlan`, `StudioResultFeedback`, `StudioKeepChangePanel` keys
- [ ] `StudioResultFeedback` renders below `GenerationPreview` in `StudioCanvas` for IMAGE results
- [ ] `StudioKeepChangePanel` is rendered by both `StudioPanelPopovers` and `StudioPanelSheets` when `panels.keepChange === true`
- [ ] Clicking a mismatch button in `StudioResultFeedback` dispatches `OPEN_PANEL` with `'keepChange'`
- [ ] Clicking "Generate Refined" in `StudioKeepChangePanel` calls `generate()` with the modified prompt
