import { describe, expect, it } from 'vitest'

import { LORA_PROMPT_DIALECTS } from '@/constants/lora-prompt-dialects'

import {
  buildSourceMatchedLoraPrompt,
  mergeNegativePrompt,
} from './lora-source-match-prompt'

describe('buildSourceMatchedLoraPrompt', () => {
  it('uses author prompts first and adds the family dialect tags', () => {
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
    expect(out.negativePrompt).toBe(
      [
        ...LORA_PROMPT_DIALECTS.illustrious.negative,
        ...LORA_PROMPT_DIALECTS.illustrious.sourceMatchNegative,
      ].join(', '),
    )
    expect(out.scale).toBe(0.85)
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
    expect(out.negativePrompt).toBe(
      [
        ...LORA_PROMPT_DIALECTS.flux.negative,
        ...LORA_PROMPT_DIALECTS.flux.sourceMatchNegative,
      ].join(', '),
    )
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

  it('merges negative prompt recommendations without duplicates', () => {
    expect(
      mergeNegativePrompt(
        'low quality, 3d render, watermark',
        '3d render, cgi, realistic',
      ),
    ).toBe('low quality, 3d render, watermark, cgi, realistic')
  })
})
