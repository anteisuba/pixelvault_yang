import { describe, expect, it } from 'vitest'

import {
  buildSourceMatchedLoraPrompt,
  mergeNegativePrompt,
} from './lora-source-match-prompt'

describe('buildSourceMatchedLoraPrompt', () => {
  it('uses author prompts first and adds anime source-match guards', () => {
    const out = buildSourceMatchedLoraPrompt({
      triggerWord: 'denia',
      type: 'subject',
      baseModelFamily: 'Illustrious',
      recommendedPrompt: 'denia, turquoise eyes, long hair',
      recommendedPromptAlternates: [],
    })

    expect(out.source).toBe('author')
    expect(out.reliable).toBe(true)
    expect(out.prompt).toContain('denia, turquoise eyes, long hair')
    expect(out.prompt).toContain('2d style')
    expect(out.prompt).toContain('anime illustration')
    expect(out.prompt).toContain('cel shading')
    expect(out.negativePrompt).toContain('3d render')
    expect(out.negativePrompt).toContain('photorealistic')
    expect(out.scale).toBe(0.85)
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

    expect(out.source).toBe('mined')
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

    expect(out.source).toBe('mined')
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

  it('merges negative prompt recommendations without duplicates', () => {
    expect(
      mergeNegativePrompt(
        'low quality, 3d render, watermark',
        '3d render, cgi, realistic',
      ),
    ).toBe('low quality, 3d render, watermark, cgi, realistic')
  })
})
