import { describe, expect, it } from 'vitest'

import type { CivitaiImageRecipe } from '@/types'

import { buildCivitaiRecipeGenerationPlan } from './civitai-recipe-to-generation'

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
    })
    expect(plan.loraScale).toBe(0.85)
    // 832/1216 ≈ 0.684 → nearest supported ratio is 3:4 (0.75), not 9:16
    expect(plan.aspectRatio).toBe('3:4')
    expect(plan.skippedParams).toEqual([])
    expect(plan.extraLoras).toEqual([])
  })

  it('lists unsupported params (sampler/clipSkip) as skipped instead of dropping silently', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({ sampler: 'DPM++ 2M Karras', clipSkip: 2, steps: 30 }),
    )

    expect(plan.advancedParams).toEqual({ steps: 30 })
    expect(plan.skippedParams).toContain('sampler')
    expect(plan.skippedParams).toContain('clipSkip')
  })

  it('skips out-of-bounds values instead of clamping them', () => {
    const plan = buildCivitaiRecipeGenerationPlan(
      makeRecipe({
        cfgScale: 45, // schema max 30
        steps: 150, // schema max 100
        seed: 99999999999, // schema max 4294967295
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

  it('keeps seed -1 (random) since the schema allows it', () => {
    const plan = buildCivitaiRecipeGenerationPlan(makeRecipe({ seed: -1 }))
    expect(plan.advancedParams?.seed).toBe(-1)
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
