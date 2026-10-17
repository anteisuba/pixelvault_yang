import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  listPromptLoras,
  matchPromptLoras,
  normalizePromptForAdapter,
  promptWeightTargetFor,
  stripPromptLoras,
  translatePromptWeights,
} from '@/lib/prompt-weight-syntax'

describe('promptWeightTargetFor', () => {
  it('maps adapters to the syntax they read', () => {
    expect(promptWeightTargetFor(AI_ADAPTER_TYPES.NOVELAI)).toBe('novelai')
    expect(promptWeightTargetFor(AI_ADAPTER_TYPES.PIXAI)).toBe('parens')
    expect(promptWeightTargetFor(AI_ADAPTER_TYPES.RUNNER)).toBe('parens')
    expect(promptWeightTargetFor(AI_ADAPTER_TYPES.GEMINI)).toBe('plain')
    expect(promptWeightTargetFor(undefined)).toBe('plain')
  })
})

describe('translatePromptWeights', () => {
  it('turns A1111 weights into NovelAI braces', () => {
    expect(
      translatePromptWeights('1girl, (rain:1.2), (hat:0.9)', 'novelai'),
    ).toBe('1girl, {{{{rain}}}}, [[hat]]')
  })

  it('leaves NovelAI-native syntax alone for NovelAI', () => {
    const text = '1.3::rain, night::, {hat}, [blur], -1::text::'
    expect(translatePromptWeights(text, 'novelai')).toBe(text)
  })

  it('turns NovelAI syntax into parens for Comfy / PixAI', () => {
    expect(
      translatePromptWeights(
        '1.3::rain, night::, {hat}, [[blur]], 1girl',
        'parens',
      ),
    ).toBe('(rain, night:1.3), (hat:1.05), (blur:0.91), 1girl')
  })

  it('drops negative emphasis where the target cannot express it', () => {
    expect(translatePromptWeights('1girl, -1::text::, smile', 'parens')).toBe(
      '1girl, smile',
    )
    expect(translatePromptWeights('1girl, -1::text::, smile', 'plain')).toBe(
      '1girl, smile',
    )
  })

  it('strips every weight for natural-language models', () => {
    expect(
      translatePromptWeights(
        'a (red:1.2) car under {{neon}} lights, 1.5::rain::',
        'plain',
      ),
    ).toBe('a red car under neon lights, rain')
    expect(translatePromptWeights('((cat:1.2), dog:1.1)', 'plain')).toBe(
      'cat, dog',
    )
  })

  it('does not touch things that only look like weights', () => {
    const cases = [
      'hatsune miku (cosplay), 1girl',
      '{"scene": "a cafe", "style": "film"}',
      'see [the guide](https://example.com) and note [1]',
      'wide shot (16:9), (ratio 3:2)',
      'a girl: 1.2 meters tall',
      'std::vector',
    ]
    for (const text of cases) {
      expect(translatePromptWeights(text, 'plain')).toBe(text)
      expect(translatePromptWeights(text, 'novelai')).toBe(text)
    }
  })

  it('keeps NovelAI Text: words untouched', () => {
    expect(
      translatePromptWeights('(sign:1.2), Text: (OPEN:1.2)', 'novelai'),
    ).toBe('{{{{sign}}}}, Text: (OPEN:1.2)')
  })
})

describe('lora tags', () => {
  it('lists lora tags with their weights', () => {
    expect(
      listPromptLoras(
        '1girl, <lora:Gothic Lolita:0.8>, <LORA:foo>, <lora:gothic lolita:1>',
      ),
    ).toEqual([
      { name: 'Gothic Lolita', scale: 0.8 },
      { name: 'foo', scale: null },
    ])
  })

  it('strips lora tags and tidies the commas', () => {
    expect(stripPromptLoras('1girl, <lora:a:0.8>, smile, <lyco:b>')).toBe(
      '1girl, smile',
    )
    expect(stripPromptLoras('<lora:a:0.8>, <lora:b:1>, smile', ['a'])).toBe(
      '<lora:b:1>, smile',
    )
  })

  it('normalizes a pasted Civitai prompt for each adapter', () => {
    const pasted = 'masterpiece, <lora:style:0.7>, (1girl:1.2), {rain}'
    expect(normalizePromptForAdapter(pasted, AI_ADAPTER_TYPES.GEMINI)).toBe(
      'masterpiece, 1girl, rain',
    )
    expect(normalizePromptForAdapter(pasted, AI_ADAPTER_TYPES.NOVELAI)).toBe(
      'masterpiece, {{{{1girl}}}}, {rain}',
    )
    expect(normalizePromptForAdapter(pasted, AI_ADAPTER_TYPES.RUNNER)).toBe(
      'masterpiece, (1girl:1.2), (rain:1.05)',
    )
  })
})

describe('matchPromptLoras', () => {
  it('matches library names loosely and reports the rest', () => {
    const library = [{ name: 'Gothic Lolita' }, { name: 'Watercolor-XL' }]
    expect(
      matchPromptLoras(
        '<lora:gothic_lolita.safetensors:0.7>, <lora:watercolor xl>, <lora:nope:1>',
        library,
      ),
    ).toEqual({
      matched: [
        {
          name: 'gothic_lolita.safetensors',
          asset: library[0],
          scale: 0.7,
        },
        { name: 'watercolor xl', asset: library[1], scale: null },
      ],
      unmatched: ['nope'],
    })
  })
})
