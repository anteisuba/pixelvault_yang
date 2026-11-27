import { describe, expect, it } from 'vitest'
import {
  buildStyleBlockParams,
  isStyleBlockTemplate,
  overlayTagStyleTemplate,
} from './tag-style-overlay'

describe('tag-style-overlay', () => {
  it('saves style block params with negative prompt and sampling settings while stripping characters/seed/refs', () => {
    const params = buildStyleBlockParams({
      aspectRatio: '3:4',
      promptDialect: 'tags',
      advancedParams: {
        negativePrompt: 'lowres, bad anatomy',
        sampler: 'k_euler_ancestral',
        steps: 28,
        guidanceScale: 5,
        ucPreset: 'light',
        seed: 12345,
        novelAiLayout: {
          positioning: 'auto',
          characters: [{ prompt: '1girl', negativePrompt: '', enabled: true }],
        },
        novelAi: {
          preciseReferences: [
            { url: 'https://r2.test/a.png', kind: 'style', strength: 1 },
          ],
        },
      },
    })

    expect(params).toEqual({
      promptDialect: 'tags',
      styleBlock: true,
      advancedParams: {
        negativePrompt: 'lowres, bad anatomy',
        sampler: 'k_euler_ancestral',
        steps: 28,
        guidanceScale: 5,
        ucPreset: 'light',
      },
    })
  })

  it('respects negative=false and params=false toggles when saving style block', () => {
    const params = buildStyleBlockParams(
      {
        advancedParams: {
          negativePrompt: 'lowres',
          steps: 28,
        },
      },
      { negative: false, params: false },
    )
    expect(params).toEqual({ promptDialect: 'tags', styleBlock: true })
  })

  it('detects explicit styleBlock flag and pure artist/medium templates', () => {
    expect(
      isStyleBlockTemplate({
        compiledPrompt: 'artist:wlop, painterly, chiaroscuro',
        params: { promptDialect: 'tags', styleBlock: true },
      }),
    ).toBe(true)
    expect(
      isStyleBlockTemplate({
        compiledPrompt: 'artist:wlop, watercolor (medium)',
        params: { promptDialect: 'tags' },
      }),
    ).toBe(true)
    expect(
      isStyleBlockTemplate({
        compiledPrompt: '1girl, solo, artist:wlop, rain',
        params: { promptDialect: 'tags' },
      }),
    ).toBe(false)
  })

  it('overlays style tags, merges negatives, updates style params, and preserves current protagonist & characters', () => {
    const result = overlayTagStyleTemplate({
      currentPositive: [
        { text: 'artist:old_artist', weight: 1 },
        { text: '1girl', weight: 1 },
        { text: 'silver hair', weight: 1.2 },
      ],
      currentNegative: [{ text: 'blurry', weight: 1 }],
      currentAdvancedParams: {
        seed: 99,
        steps: 23,
        novelAiLayout: {
          positioning: 'auto',
          characters: [
            {
              prompt: 'girl, red eyes',
              negativePrompt: '',
              position: { x: 0.5, y: 0.5 },
              enabled: true,
            },
          ],
        },
      },
      recipe: {
        compiledPrompt:
          'artist:new_artist, watercolor (medium), warm lighting, chiaroscuro',
        negativePrompt: 'blurry, lowres',
        params: {
          promptDialect: 'tags',
          styleBlock: true,
          advancedParams: {
            sampler: 'k_dpmpp_2s_ancestral',
            steps: 28,
            guidanceScale: 4.5,
            ucPreset: 'light',
            seed: 777,
          },
        },
      },
    })

    expect(result.positive).toEqual([
      { text: 'artist:new_artist', weight: 1 },
      { text: 'watercolor (medium)', weight: 1 },
      { text: '1girl', weight: 1 },
      { text: 'silver hair', weight: 1.2 },
      { text: 'warm lighting', weight: 1 },
      { text: 'chiaroscuro', weight: 1 },
    ])
    expect(result.negative).toEqual([
      { text: 'blurry', weight: 1 },
      { text: 'lowres', weight: 1 },
    ])
    expect(result.advancedParams).toMatchObject({
      seed: 99,
      sampler: 'k_dpmpp_2s_ancestral',
      steps: 28,
      guidanceScale: 4.5,
      ucPreset: 'light',
      negativePrompt: 'blurry, lowres',
    })
    expect(result.advancedParams.novelAiLayout?.characters).toHaveLength(1)
  })

  it('extracts only artist/medium tags when overlaying a full scene template', () => {
    const result = overlayTagStyleTemplate({
      currentPositive: [{ text: '1boy', weight: 1 }],
      currentNegative: [],
      currentAdvancedParams: {},
      recipe: {
        compiledPrompt:
          '1girl, school uniform, artist:wlop, oil painting (medium), classroom',
        negativePrompt: null,
        params: { promptDialect: 'tags' },
      },
    })

    expect(result.positive).toEqual([
      { text: 'artist:wlop', weight: 1 },
      { text: 'oil painting (medium)', weight: 1 },
      { text: '1boy', weight: 1 },
    ])
  })
})
