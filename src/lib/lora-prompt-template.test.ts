import { describe, expect, it } from 'vitest'

import { buildLoraPromptTemplate } from './lora-prompt-template'

describe('buildLoraPromptTemplate', () => {
  it('uses the author-recommended prompt verbatim when present', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'cure mystique',
      type: 'subject',
      baseModelFamily: 'Pony',
      recommendedPrompt: 'cure mystique, pink hair, magical girl, dynamic pose',
    })
    expect(out).toBe('cure mystique, pink hair, magical girl, dynamic pose')
    expect(out).not.toContain('score_9')
  })

  it('ignores empty recommendedPrompt and falls back to the subject skeleton', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Illustrious',
      recommendedPrompt: '   ',
    })
    expect(out).toBe(
      'denia, portrait, dynamic pose, soft cinematic lighting, masterpiece, best quality',
    )
  })

  it('uses the scenery skeleton for style LoRAs without an author prompt', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: '@bxz',
      type: 'style',
      baseModelFamily: 'SDXL 1.0',
      recommendedPrompt: null,
    })
    expect(out).toBe(
      '@bxz, beautiful scenery, soft cinematic lighting, highly detailed, masterpiece, best quality',
    )
  })

  it('leads with the pony score prefix for a pony LoRA', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Pony',
    })
    expect(out).toBe(
      'score_9, score_8_up, score_7_up, denia, portrait, dynamic pose, soft cinematic lighting',
    )
  })

  it('writes a natural-language skeleton for flux and keeps the score prefix out', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Flux.1 D',
    })
    expect(out).toBe(
      'denia, natural pose, soft cinematic lighting, richly detailed',
    )
    expect(out).not.toContain('score_')
  })

  it('falls back to the generic skeleton when the family does not normalize', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'sks_character',
      type: 'subject',
      baseModelFamily: 'Some Unreleased Base',
    })
    expect(out).toBe(
      'sks_character, portrait, dynamic pose, soft cinematic lighting, masterpiece, best quality',
    )
    expect(out).not.toContain('score_')
  })
})
