import { describe, expect, it } from 'vitest'

import type { LoraAssetRecord } from '@/types'

import {
  buildRecipeLoraSetup,
  loraTemplateFallbackName,
  readRecipeLoraSetup,
  readRecipeNegativePrompt,
  readRecipeNovelAiCharacters,
  readRecipeRunnerParameters,
  templateLoraAssetFromUrl,
  trimLoraAssetForTemplate,
  withRecipeNegativePrompt,
} from './recipe-lora-setup'

const SUE_URL = 'https://civitai.com/api/download/models/111'

const asset = (over: Partial<LoraAssetRecord> = {}): LoraAssetRecord => ({
  id: 'civitai:1',
  styleCode: '',
  name: '祀 (Sue)',
  source: 'imported',
  type: 'subject',
  baseModelFamily: 'Illustrious',
  provider: 'civitai',
  triggerWord: 'sue',
  loraUrl: SUE_URL,
  coverImageUrl: null,
  previewImageUrls: ['https://image.civitai.com/a.jpeg'],
  defaultScale: 1,
  isPublic: false,
  isOwn: false,
  createdAt: '2026-09-28T00:00:00.000Z',
  recommendedPrompt: 'sue, 1girl, a very long author prompt',
  recommendedPromptAlternates: [{ label: 'alt', prompt: 'sue, smile' }],
  ...over,
})

describe('readRecipeLoraSetup', () => {
  it('reads the whole setup the LoRA bench saved', () => {
    const read = readRecipeLoraSetup({
      loraSetup: {
        baseId: 'illustrious-runner',
        items: [{ asset: asset(), scale: 0.9 }],
      },
    })

    expect(read?.baseId).toBe('illustrious-runner')
    expect(read?.items).toEqual([
      {
        url: SUE_URL,
        scale: 0.9,
        asset: expect.objectContaining({ name: '祀 (Sue)' }),
      },
    ])
  })

  it('falls back to the links and weights an older save kept, with no names', () => {
    const read = readRecipeLoraSetup({
      advancedParams: {
        loras: [{ url: SUE_URL, scale: 0.6 }, { url: SUE_URL }],
      },
    })

    expect(read).toEqual({
      baseId: null,
      items: [
        { url: SUE_URL, scale: 0.6, asset: null },
        { url: SUE_URL, scale: 1, asset: null },
      ],
    })
  })

  it('is null for a template without LoRAs', () => {
    expect(readRecipeLoraSetup(null)).toBeNull()
    expect(readRecipeLoraSetup({ advancedParams: { steps: 30 } })).toBeNull()
    expect(readRecipeLoraSetup({ advancedParams: { loras: [] } })).toBeNull()
  })
})

describe('readRecipeRunnerParameters', () => {
  it('keeps only the Runner controls that were saved', () => {
    expect(
      readRecipeRunnerParameters({
        aspectRatio: '3:4',
        advancedParams: {
          steps: 28,
          guidanceScale: 5,
          runnerSampler: 'euler_ancestral',
          runnerWidth: 832,
          runnerHeight: 1216,
          loras: [{ url: SUE_URL, scale: 0.9 }],
          seed: 7,
        },
      }),
    ).toEqual({
      steps: 28,
      guidanceScale: 5,
      runnerSampler: 'euler_ancestral',
      runnerWidth: 832,
      runnerHeight: 1216,
    })
  })

  it('is empty when nothing usable was saved', () => {
    expect(readRecipeRunnerParameters(undefined)).toEqual({})
    expect(
      readRecipeRunnerParameters({ advancedParams: { steps: 'thirty' } }),
    ).toEqual({})
  })
})

describe('buildRecipeLoraSetup', () => {
  it('drops the long fields restoring does not need', () => {
    const setup = buildRecipeLoraSetup('illustrious-runner', [
      { asset: asset(), scale: 0.9 },
    ])

    const saved = setup?.items[0]?.asset
    expect(saved?.previewImageUrls).toEqual([])
    expect(saved).not.toHaveProperty('recommendedPrompt')
    expect(saved).not.toHaveProperty('recommendedPromptAlternates')
    expect(saved?.triggerWord).toBe('sue')
    expect(trimLoraAssetForTemplate(asset()).name).toBe('祀 (Sue)')
  })

  it('is null without a base or without LoRAs', () => {
    expect(
      buildRecipeLoraSetup(null, [{ asset: asset(), scale: 1 }]),
    ).toBeNull()
    expect(buildRecipeLoraSetup('illustrious-runner', [])).toBeNull()
  })
})

describe('older saves with only a link', () => {
  it('names a LoRA by its Hugging Face file or Civitai version', () => {
    expect(loraTemplateFallbackName(SUE_URL)).toBe('Civitai 111')
    expect(
      loraTemplateFallbackName(
        'https://huggingface.co/a/b/resolve/abc/anima%20style.safetensors',
      ),
    ).toBe('anima style')
    expect(loraTemplateFallbackName('not a url')).toBe('LoRA')
  })

  it('builds a stack record without inventing a trigger word', () => {
    const record = templateLoraAssetFromUrl({
      url: SUE_URL,
      scale: 0.6,
      name: null,
      baseModelFamily: 'illustrious',
    })

    expect(record).toMatchObject({
      id: `template-lora:${SUE_URL}`,
      name: 'Civitai 111',
      provider: 'civitai',
      triggerWord: '',
      loraUrl: SUE_URL,
      defaultScale: 0.6,
      baseModelFamily: 'illustrious',
    })
  })
})

describe('标签模板的负面与角色（pages/prompts.md）', () => {
  it('负面：列里有就用列里的，没有再读整组参数里那一份', () => {
    expect(
      readRecipeNegativePrompt({
        negativePrompt: ' worst quality ',
        params: { advancedParams: { negativePrompt: 'lowres' } },
      }),
    ).toBe('worst quality')
    expect(
      readRecipeNegativePrompt({
        negativePrompt: null,
        params: { advancedParams: { negativePrompt: 'lowres, bad hands' } },
      }),
    ).toBe('lowres, bad hands')
    expect(
      readRecipeNegativePrompt({ negativePrompt: null, params: null }),
    ).toBe('')
  })

  it('改负面时整组参数里那一份一起改，别的参数原样', () => {
    expect(
      withRecipeNegativePrompt(
        {
          promptDialect: 'tags',
          advancedParams: { negativePrompt: 'a', steps: 28 },
        },
        'b',
      ),
    ).toEqual({
      promptDialect: 'tags',
      advancedParams: { negativePrompt: 'b', steps: 28 },
    })
  })

  it('角色只要写了标签、没关掉的那几位', () => {
    const position = { x: 0.5, y: 0.5 }
    expect(
      readRecipeNovelAiCharacters({
        advancedParams: {
          novelAiLayout: {
            positioning: 'auto',
            characters: [
              { prompt: 'girl, red eyes', negativePrompt: '', position },
              { prompt: '', negativePrompt: '', position },
              { prompt: 'boy', negativePrompt: '', position, enabled: false },
            ],
          },
        },
      }),
    ).toEqual(['girl, red eyes'])
    expect(readRecipeNovelAiCharacters({ advancedParams: {} })).toEqual([])
  })
})
