import { describe, expect, it } from 'vitest'

import { LORA_BASE_FAMILIES } from '@/constants/lora-base-models'
import {
  findForbiddenDialectHits,
  LORA_PROMPT_DIALECTS,
} from '@/constants/lora-prompt-dialects'

describe('lora prompt dialects', () => {
  it('covers every base family', () => {
    expect(Object.keys(LORA_PROMPT_DIALECTS).sort()).toEqual(
      [...LORA_BASE_FAMILIES].sort(),
    )
  })

  it("keeps Pony's score_N_up prefix on pony; Anima writes its own score_N", () => {
    expect(LORA_PROMPT_DIALECTS.pony.skeleton.subject).toContain(
      'score_9, score_8_up',
    )
    expect(LORA_PROMPT_DIALECTS.pony.skeleton.style).toContain(
      'score_9, score_8_up',
    )

    for (const family of ['illustrious', 'sdxl', 'flux'] as const) {
      const { skeleton } = LORA_PROMPT_DIALECTS[family]
      expect(skeleton.subject).not.toContain('score_')
      expect(skeleton.style).not.toContain('score_')
    }

    // The Anima model page's own prefix: score_7 without `_up`.
    const anima = LORA_PROMPT_DIALECTS['anima-dit'].skeleton
    expect(
      anima.subject.startsWith('masterpiece, best quality, score_7, safe'),
    ).toBe(true)
    expect(anima.subject).not.toContain('_up')
  })

  it('puts the quality tags first on the tag families', () => {
    for (const family of ['illustrious', 'sdxl', 'anima'] as const) {
      const { skeleton } = LORA_PROMPT_DIALECTS[family]
      expect(skeleton.subject.startsWith('masterpiece, best quality')).toBe(
        true,
      )
      expect(skeleton.style.startsWith('masterpiece, best quality')).toBe(true)
    }
  })

  it('keeps the trigger placeholder in every skeleton', () => {
    for (const family of LORA_BASE_FAMILIES) {
      const { skeleton } = LORA_PROMPT_DIALECTS[family]
      expect(skeleton.subject).toContain('{trigger}')
      expect(skeleton.subject).toContain('{subject}')
      expect(skeleton.style).toContain('{trigger}')
      expect(skeleton.style).toContain('{style}')
    }
  })

  it('turns parenthesis weighting off for the sentence families (flux, z-image)', () => {
    expect(LORA_PROMPT_DIALECTS.flux.weightedParens).toBe(false)
    expect(LORA_PROMPT_DIALECTS['z-image'].weightedParens).toBe(false)
    expect(LORA_PROMPT_DIALECTS['anima-dit'].weightedParens).toBe(true)
    expect(LORA_PROMPT_DIALECTS.pony.weightedParens).toBe(true)
    expect(LORA_PROMPT_DIALECTS.illustrious.weightedParens).toBe(true)
  })

  it('recommends a negative for every family but the CFG 1 routes (flux, z-image, krea2), which run without one', () => {
    for (const family of LORA_BASE_FAMILIES) {
      const { negative } = LORA_PROMPT_DIALECTS[family]
      if (family === 'flux' || family === 'z-image' || family === 'krea2')
        expect(negative).toEqual([])
      else expect(negative.length).toBeGreaterThan(0)
    }
    expect(LORA_PROMPT_DIALECTS.pony.negative.slice(0, 3)).toEqual([
      'score_6',
      'score_5',
      'score_4',
    ])
    expect(LORA_PROMPT_DIALECTS['anima-dit'].negative).toEqual(
      expect.arrayContaining(['score_1', 'score_2', 'score_3', 'artist name']),
    )
  })

  it('names an order for every family, and Runner parameters only where a Runner base serves it', () => {
    for (const family of LORA_BASE_FAMILIES) {
      const { order, parameters } = LORA_PROMPT_DIALECTS[family]
      expect(order.length).toBeGreaterThan(0)
      if (family === 'flux' || family === 'sd15') expect(parameters).toBeNull()
      else expect(parameters).toEqual(expect.stringContaining('steps'))
    }
  })

  it('flags the pony score prefix on flux but not on pony', () => {
    const hits = findForbiddenDialectHits('flux', 'score_9, 1girl')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.why.length > 0)).toBe(true)

    expect(findForbiddenDialectHits('pony', 'score_9, 1girl')).toEqual([])
  })

  it("flags Pony's score_N_up on anima-dit, but lets its own score_N and weighting through", () => {
    expect(
      findForbiddenDialectHits('anima-dit', 'score_9, score_8_up, hoshigetsu'),
    ).toHaveLength(1)
    expect(
      findForbiddenDialectHits(
        'anima-dit',
        'score_9, score_8, hoshigetsu, @nnn yryr, (detailed eyes:1.3)',
      ),
    ).toEqual([])
  })

  it('flags score and NoobAI / Anima tags on z-image, but not a sentence that merely says newest', () => {
    expect(
      findForbiddenDialectHits('z-image', 'score_9, a girl').length,
    ).toBeGreaterThan(0)
    expect(
      findForbiddenDialectHits('z-image', 'masterpiece, newest, a girl').length,
    ).toBeGreaterThan(0)
    expect(
      findForbiddenDialectHits('z-image', 'the newest skyscraper at dusk'),
    ).toEqual([])
  })

  it('returns no hits for clean text', () => {
    expect(
      findForbiddenDialectHits(
        'flux',
        'denia, a photograph of a woman in a red coat, soft cinematic lighting',
      ),
    ).toEqual([])
  })
})
