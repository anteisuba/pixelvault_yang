import { describe, expect, it } from 'vitest'

import type { CivitaiImageRecipe } from '@/types'

import {
  applyRecipePlanToAdvancedParams,
  buildCivitaiRecipeGenerationPlan,
} from './civitai-recipe-to-generation'

function makeRecipe(
  overrides: Partial<CivitaiImageRecipe> = {},
): CivitaiImageRecipe {
  return {
    imageUrl: 'https://image.civitai.com/example/width=450/1.jpeg',
    source: 'model_version_image',
    prompt: 'nivora, turquoise eyes, white dress, 2d style',
    ...overrides,
  }
}

describe('buildCivitaiRecipeGenerationPlan', () => {
  it('maps a full recipe into prompt + advanced params + scale + aspect ratio', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({
        negativePrompt: '3d, realistic, bad hands',
        seed: 1234567890,
        steps: 28,
        cfgScale: 6.5,
        width: 832,
        height: 1216,
        loraWeight: 0.85,
      }),
    )

    expect(plan.prompt).toBe('nivora, turquoise eyes, white dress, 2d style')
    expect(plan.advancedParams).toEqual({
      negativePrompt: '3d, realistic, bad hands',
      guidanceScale: 6.5,
      steps: 28,
      seed: 1234567890,
      runnerSeed: '1234567890',
    })
    expect(plan.loraScale).toBe(0.85)
    // 832/1216 ≈ 0.684 → nearest supported ratio is 3:4 (0.75), not 9:16
    expect(plan.aspectRatio).toBe('3:4')
    expect(plan.skippedParams).toEqual([])
    expect(plan.extraLoras).toEqual([])
  })

  it('normalizes Civitai sampler+scheduler and keeps unsupported clipSkip visible', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({
        sampler: 'DPM++ 2M Karras',
        scheduler: 'Karras',
        clipSkip: 2,
        steps: 30,
      }),
    )

    expect(plan.advancedParams).toEqual({
      steps: 30,
      runnerSampler: 'dpmpp_2m',
      runnerScheduler: 'karras',
    })
    expect(plan.skippedParams).not.toContain('sampler')
    expect(plan.skippedParams).toContain('clipSkip')
  })

  it('skips out-of-bounds values instead of clamping them', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({
        cfgScale: 45, // schema max 30
        steps: 150, // schema max 100
        seed: '18446744073709551616', // above uint64 max
        loraWeight: 3, // LoraSchema scale max 2
      }),
    )

    expect(plan.advancedParams).toBeUndefined()
    expect(plan.loraScale).toBeUndefined()
    expect(plan.skippedParams).toEqual(
      expect.arrayContaining(['cfgScale', 'steps', 'seed', 'loraWeight']),
    )
  })

  it('derives aspect ratio from sizeRaw when width/height are missing', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({ sizeRaw: '512x768' }),
    )
    expect(plan.aspectRatio).toBe('3:4')
    expect(plan.advancedParams).toMatchObject({
      runnerWidth: 512,
      runnerHeight: 768,
    })

    const landscape = buildCivitaiRecipeGenerationPlan(
      makeRecipe({ sizeRaw: '1920 x 1080' }),
    )
    expect(landscape.aspectRatio).toBe('16:9')
  })

  it('marks unparsable sizeRaw as skipped and leaves aspect ratio undefined', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({ sizeRaw: 'portrait-large' }),
    )
    expect(plan.aspectRatio).toBeUndefined()
    expect(plan.skippedParams).toContain('size')
  })

  it('rejects negative/random sentinel seeds for exact replay', () => {
    const plan = buildCivitaiRecipeGenerationPlan(makeRecipe({ seed: -1 }))
    expect(plan.advancedParams).toBeUndefined()
    expect(plan.skippedParams).toContain('seed')
  })

  it('preserves a large Civitai seed as an exact decimal string', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({ seed: '5536891017203' }),
    )
    expect(plan.advancedParams).toEqual({ runnerSeed: '5536891017203' })
    expect(plan.appliedParams).toContain('seed')
  })

  it('prefers meta.Size base dimensions over the final upscaled image size', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({
        width: 1664,
        height: 2432,
        baseWidth: 832,
        baseHeight: 1216,
        sizeRaw: '832x1216',
      }),
    )
    expect(plan.advancedParams).toMatchObject({
      runnerWidth: 832,
      runnerHeight: 1216,
    })
    expect(plan.aspectRatio).toBe('3:4')
  })

  it('passes extraLoras through so the UI can warn about limited fidelity', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({
        extraLoras: [{ name: 'detail-tweaker', weight: 0.4 }],
      }),
    )
    expect(plan.extraLoras).toEqual([{ name: 'detail-tweaker', weight: 0.4 }])
  })

  it('returns a minimal plan for a prompt-only recipe', () => {
    const plan = buildCivitaiRecipeGenerationPlan(makeRecipe())
    expect(plan.prompt).toBeTruthy()
    expect(plan.advancedParams).toBeUndefined()
    expect(plan.loraScale).toBeUndefined()
    expect(plan.aspectRatio).toBeUndefined()
    expect(plan.skippedParams).toEqual([])
  })
})

describe('applyRecipePlanToAdvancedParams', () => {
  const fullPlan = buildCivitaiRecipeGenerationPlan(
    makeRecipe({
      negativePrompt: '3d, cgi',
      seed: 42,
      steps: 28,
      cfgScale: 6.5,
    }),
  )

  it('merges negative prompt and overwrites guidance/steps/seed', () => {
    const next = applyRecipePlanToAdvancedParams(
      { negativePrompt: 'blurry, 3d', guidanceScale: 9, quality: 'high' },
      fullPlan,
      { includeSeed: true },
    )
    // user's words kept, recipe words deduped-appended
    expect(next.negativePrompt).toBe('blurry, 3d, cgi')
    expect(next.guidanceScale).toBe(6.5)
    expect(next.steps).toBe(28)
    expect(next.seed).toBe(42)
    expect(next.runnerSeed).toBe('42')
    // unrelated existing params untouched
    expect(next.quality).toBe('high')
  })

  it('skips seed when includeSeed is false (random toggle)', () => {
    const next = applyRecipePlanToAdvancedParams({ seed: 7 }, fullPlan, {
      includeSeed: false,
    })
    expect(next.seed).toBe(7)
  })

  it('returns existing params unchanged for a plan with no advanced params', () => {
    const emptyPlan = buildCivitaiRecipeGenerationPlan(makeRecipe())
    const existing = { negativePrompt: 'blurry' }
    expect(
      applyRecipePlanToAdvancedParams(existing, emptyPlan, {
        includeSeed: true,
      }),
    ).toEqual(existing)
  })
})
