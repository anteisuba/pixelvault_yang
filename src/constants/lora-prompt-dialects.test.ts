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

  it('keeps the score prefix on pony only', () => {
    expect(LORA_PROMPT_DIALECTS.pony.skeleton.subject).toContain('score_9')
    expect(LORA_PROMPT_DIALECTS.pony.skeleton.style).toContain('score_9')

    for (const family of ['illustrious', 'flux', 'anima-dit'] as const) {
      const { skeleton } = LORA_PROMPT_DIALECTS[family]
      expect(skeleton.subject).not.toContain('score_')
      expect(skeleton.style).not.toContain('score_')
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

  it('turns parenthesis weighting off for flux and anima-dit', () => {
    expect(LORA_PROMPT_DIALECTS.flux.weightedParens).toBe(false)
    expect(LORA_PROMPT_DIALECTS['anima-dit'].weightedParens).toBe(false)
    expect(LORA_PROMPT_DIALECTS.pony.weightedParens).toBe(true)
    expect(LORA_PROMPT_DIALECTS.illustrious.weightedParens).toBe(true)
  })

  it('recommends a negative for every family', () => {
    for (const family of LORA_BASE_FAMILIES) {
      expect(LORA_PROMPT_DIALECTS[family].negative.length).toBeGreaterThan(0)
    }
  })

  it('flags the pony score prefix on flux but not on pony', () => {
    const hits = findForbiddenDialectHits('flux', 'score_9, 1girl')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.why.length > 0)).toBe(true)

    expect(findForbiddenDialectHits('pony', 'score_9, 1girl')).toEqual([])
  })

  it('flags parenthesis weighting on anima-dit', () => {
    expect(
      findForbiddenDialectHits('anima-dit', 'hoshigetsu, (detailed eyes:1.3)'),
    ).toHaveLength(1)
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
