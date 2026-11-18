import { describe, expect, it } from 'vitest'

import { LORA_PROMPT_DIALECTS } from '@/features/lora/constants/lora-prompt-dialects'

import type { CivitaiImageRecipe } from '@/types'

import {
  buildSourceMatchedLoraPrompt,
  mergeNegativePrompt,
  resolveLoraRestorePlan,
} from './lora-source-match-prompt'

describe('buildSourceMatchedLoraPrompt', () => {
  it('uses the author prompt as written — no style words appended', () => {
    const out = buildSourceMatchedLoraPrompt({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Illustrious',
      recommendedPrompt: 'denia, turquoise eyes, long hair',
      recommendedPromptAlternates: [],
    })

    expect(out.source).toBe('author')
    expect(out.reliable).toBe(true)
    expect(out.prompt).toBe('denia, turquoise eyes, long hair')
    // Only the family's own negative staples; no invented "anti-3D" extras.
    expect(out.negativePrompt).toBe(
      LORA_PROMPT_DIALECTS.illustrious.negative.join(', '),
    )
    expect(out).not.toHaveProperty('scale')
  })

  it('takes the negative from the flux dialect and adds no anime tags', () => {
    const out = buildSourceMatchedLoraPrompt({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Flux.1 D',
      recommendedPrompt: 'denia, a photograph of a woman in a red coat',
      recommendedPromptAlternates: [],
    })

    expect(out.prompt).toBe('denia, a photograph of a woman in a red coat')
    expect(out.negativePrompt).toBe('')
  })

  it('adds no dialect material when the family does not normalize', () => {
    const out = buildSourceMatchedLoraPrompt({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Some Unreleased Base',
      recommendedPrompt: 'denia, turquoise eyes, long hair',
      recommendedPromptAlternates: [],
    })

    expect(out.prompt).toBe('denia, turquoise eyes, long hair')
    expect(out.negativePrompt).toBe('')
    expect(out.reliable).toBe(true)
  })

  it('prefers Civitai source image prompts over rich author text', () => {
    const out = buildSourceMatchedLoraPrompt(
      {
        triggerWord: 'denia',
        type: 'subject',
        baseModelFamily: 'Illustrious',
        recommendedPrompt: 'denia, turquoise eyes, long hair',
        recommendedPromptAlternates: [],
      },
      [
        {
          label: 'Source image 1',
          prompt: 'denia, white hood, upper body, looking at viewer',
          sampleCount: 1,
          source: 'model_version_image',
        },
      ],
    )

    expect(out.source).toBe('source_image')
    expect(out.reliable).toBe(true)
    expect(out.prompt).toContain('white hood')
    expect(out.prompt).not.toContain('long hair')
  })

  it('falls back to mined prompts when author prompts are missing', () => {
    const out = buildSourceMatchedLoraPrompt(
      {
        triggerWord: 'character_token',
        type: 'subject',
        baseModelFamily: 'Illustrious',
        recommendedPrompt: null,
        recommendedPromptAlternates: [],
      },
      [
        {
          label: 'community outfit',
          prompt: 'blue dress, studio background',
          sampleCount: 4,
        },
      ],
    )

    expect(out.source).toBe('community')
    expect(out.reliable).toBe(true)
    expect(out.prompt).toContain('character_token')
    expect(out.prompt).toContain('blue dress')
  })

  it('prefers a mined community prompt over a bare-trigger author prompt', () => {
    const out = buildSourceMatchedLoraPrompt(
      {
        // Author trainedWords is just the trigger — too sparse to match a
        // source image. The richer mined community prompt should win.
        triggerWord: 'denia',
        type: 'subject',
        baseModelFamily: 'Illustrious',
        recommendedPrompt: 'denia',
        recommendedPromptAlternates: [],
      },
      [
        {
          label: 'community outfit',
          prompt: 'school uniform, classroom, looking at viewer',
          sampleCount: 9,
        },
      ],
    )

    expect(out.source).toBe('community')
    expect(out.reliable).toBe(true)
    expect(out.prompt).toContain('denia')
    expect(out.prompt).toContain('school uniform')
  })

  it('flags fallback unreliable when only a bare trigger is available', () => {
    const out = buildSourceMatchedLoraPrompt({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Illustrious',
      recommendedPrompt: 'denia',
      recommendedPromptAlternates: [],
    })

    expect(out.source).toBe('fallback')
    expect(out.reliable).toBe(false)
  })

  it('passes the source image prompt through verbatim (weights rewritten for ComfyUI only)', () => {
    const out = buildSourceMatchedLoraPrompt(
      {
        triggerWord: 'denia',
        type: 'subject',
        baseModelFamily: 'Illustrious',
        recommendedPrompt: null,
        recommendedPromptAlternates: [],
      },
      [
        {
          label: 'Source image 1',
          prompt: 'denia, [white hood], upper body',
          sampleCount: 1,
          source: 'model_version_image',
        },
      ],
    )
    expect(out.prompt).toBe('denia, (white hood:0.91), upper body')
  })

  it('merges negative prompt recommendations without duplicates', () => {
    expect(
      mergeNegativePrompt(
        'low quality, 3d render, watermark',
        '3d render, cgi, realistic',
      ),
    ).toBe('low quality, 3d render, watermark, cgi, realistic')
  })
})

const RESTORE_ASSET: Parameters<typeof resolveLoraRestorePlan>[0] = {
  triggerWord: 'denia',
  type: 'subject',
  baseModelFamily: 'Illustrious',
  recommendedPrompt: 'denia, turquoise eyes, long hair',
  recommendedPromptAlternates: [],
}

function makeSourceRecipe(
  overrides: Partial<CivitaiImageRecipe> = {},
): CivitaiImageRecipe {
  return {
    imageUrl: 'https://image.civitai.com/example/1.jpeg',
    source: 'model_version_image',
    prompt: 'denia, white hood, upper body',
    negativePrompt: 'lowres',
    sampler: 'Euler a',
    steps: 28,
    cfgScale: 6,
    seed: 1234,
    sizeRaw: '832x1216',
    ...overrides,
  }
}

describe('resolveLoraRestorePlan', () => {
  it('restores a complete source recipe as-is', () => {
    const recipe = makeSourceRecipe()
    const plan = resolveLoraRestorePlan(RESTORE_ASSET, {
      outfits: [],
      recipes: [recipe],
    })
    expect(plan).toEqual({ kind: 'faithful', recipe })
  })

  it("prefers the version's own source image over a community one", () => {
    const community = makeSourceRecipe({ source: 'community_image' })
    const own = makeSourceRecipe({ seed: 99 })
    const plan = resolveLoraRestorePlan(RESTORE_ASSET, {
      outfits: [],
      recipes: [community, own],
    })
    expect(plan).toEqual({ kind: 'faithful', recipe: own })
  })

  it('never treats an AI-inferred or parameter-less recipe as faithful', () => {
    for (const recipe of [
      makeSourceRecipe({ source: 'ai_inferred' }),
      makeSourceRecipe({ seed: undefined }),
      makeSourceRecipe({ steps: undefined }),
      makeSourceRecipe({ cfgScale: undefined }),
      makeSourceRecipe({ sampler: undefined }),
      makeSourceRecipe({ sizeRaw: undefined }),
    ]) {
      const plan = resolveLoraRestorePlan(RESTORE_ASSET, {
        outfits: [],
        recipes: [recipe],
      })
      expect(plan.kind).toBe('approximate')
    }
  })

  it('falls back to an approximate prompt and says it is approximate', () => {
    const plan = resolveLoraRestorePlan(
      { ...RESTORE_ASSET, recommendedPrompt: 'denia' },
      { outfits: [], recipes: [] },
    )
    expect(plan.kind).toBe('approximate')
    if (plan.kind !== 'approximate') return
    expect(plan.reliable).toBe(false)
    expect(plan.prompt).not.toContain('2d style')
  })
})
