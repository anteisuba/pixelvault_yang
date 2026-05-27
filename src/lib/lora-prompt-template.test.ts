import { describe, expect, it } from 'vitest'

import { buildLoraPromptTemplate } from './lora-prompt-template'

describe('buildLoraPromptTemplate', () => {
  it('uses the author-recommended prompt verbatim when present', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'cure mystique',
      type: 'subject',
      recommendedPrompt: 'cure mystique, pink hair, magical girl, dynamic pose',
    })
    expect(out).toBe('cure mystique, pink hair, magical girl, dynamic pose')
  })

  it('ignores empty recommendedPrompt and falls back to the subject template', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'denia',
      type: 'subject',
      recommendedPrompt: '   ',
    })
    expect(out).toBe(
      'denia, portrait, dynamic pose, soft cinematic lighting, masterpiece, best quality',
    )
  })

  it('uses the scenery template for style LoRAs without an author prompt', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: '@bxz',
      type: 'style',
      recommendedPrompt: null,
    })
    expect(out).toBe(
      '@bxz, beautiful scenery, soft cinematic lighting, highly detailed',
    )
  })

  it('works without a recommendedPrompt field at all (LoraAssetRecord callers)', () => {
    const out = buildLoraPromptTemplate({
      triggerWord: 'sks_character',
      type: 'subject',
    })
    expect(out).toContain('sks_character')
    expect(out).toContain('portrait')
  })
})
