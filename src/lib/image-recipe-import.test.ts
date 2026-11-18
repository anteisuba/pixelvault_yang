import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ImageRecipeReading } from '@/types/image-recipe'
import {
  applyImageRecipe,
  imageRecipeRows,
  type ImageRecipeRowKey,
} from '@/lib/image-recipe-import'

const NAI: ImageRecipeReading = {
  recipe: {
    source: 'novelai',
    model: 'NovelAI Diffusion V4.5',
    prompt: '2girls, artist:wlop',
    negative: 'lowres',
    characters: [
      {
        prompt: 'girl, red hair',
        negative: 'blue eyes',
        center: { x: 0.33, y: 0.52 },
      },
      { prompt: 'girl, black hair', negative: '', center: null },
    ],
    manualPositions: true,
    steps: 28,
    cfg: 5,
    sampler: 'k_euler_ancestral',
    width: 832,
    height: 1216,
    seed: '1234567890',
  },
  tags: null,
}

const CURRENT = {
  prompt: 'old prompt',
  advancedParams: { negativePrompt: 'old negative', steps: 23 },
  aspectRatio: '1:1' as const,
}

const steps = (count: number) => `${count} steps`
const pick = (...keys: ImageRecipeRowKey[]) => new Set(keys)

describe('imageRecipeRows', () => {
  it('ticks positive, negative and characters by default, not settings or seed', () => {
    const rows = imageRecipeRows(NAI, steps)
    expect(rows.map((row) => [row.key, row.defaultOn])).toEqual([
      ['positive', true],
      ['negative', true],
      ['characters', true],
      ['params', false],
      ['seed', false],
    ])
    expect(rows.find((row) => row.key === 'params')?.preview).toBe(
      '28 steps · CFG 5 · k_euler_ancestral · 832×1216',
    )
  })

  it('offers the tagger groups when the picture carries no recipe', () => {
    const rows = imageRecipeRows(
      {
        recipe: null,
        tags: {
          artist: ['wlop'],
          character: [],
          general: ['1girl', 'long_hair'],
        },
      },
      steps,
    )
    expect(rows.map((row) => [row.key, row.preview])).toEqual([
      ['artist', 'artist:wlop'],
      ['general', '1girl, long hair'],
    ])
  })
})

describe('applyImageRecipe', () => {
  it('replaces the ticked boxes and leaves the rest alone', () => {
    const next = applyImageRecipe(
      NAI,
      pick('positive'),
      CURRENT,
      AI_MODELS.NOVELAI_V45_FULL,
    )
    expect(next.prompt).toBe('2girls, artist:wlop')
    expect(next.advancedParams.negativePrompt).toBe('old negative')
    expect(next.advancedParams.steps).toBe(23)
    expect(next.aspectRatio).toBe('1:1')
  })

  it('lays characters out on the V4.5 grid with their own negatives', () => {
    const next = applyImageRecipe(
      NAI,
      pick('positive', 'negative', 'characters'),
      CURRENT,
      AI_MODELS.NOVELAI_V45_FULL,
    )
    expect(next.advancedParams.negativePrompt).toBe('lowres')
    expect(next.advancedParams.novelAiLayout).toEqual({
      positioning: 'manual',
      characters: [
        {
          prompt: 'girl, red hair',
          negativePrompt: 'blue eyes',
          position: { x: 0.3, y: 0.5 },
        },
        {
          prompt: 'girl, black hair',
          negativePrompt: '',
          position: { x: 0.5, y: 0.5 },
        },
      ],
    })
  })

  it('folds characters into the positive when the bench cannot place them', () => {
    const next = applyImageRecipe(
      NAI,
      pick('positive', 'characters'),
      CURRENT,
      undefined,
    )
    expect(next.prompt).toBe(
      '2girls, artist:wlop, girl, red hair, girl, black hair',
    )
    expect(next.advancedParams.novelAiLayout).toBeUndefined()
  })

  it('brings settings, size and seed only when asked', () => {
    const next = applyImageRecipe(
      NAI,
      pick('params', 'seed'),
      CURRENT,
      AI_MODELS.NOVELAI_V45_FULL,
    )
    expect(next.prompt).toBe('old prompt')
    expect(next.advancedParams).toMatchObject({
      steps: 28,
      guidanceScale: 5,
      sampler: 'k_euler_ancestral',
      seed: 1234567890,
    })
    expect(next.aspectRatio).toBe('3:4')
  })

  it('puts the ticked tagger groups into the positive', () => {
    const next = applyImageRecipe(
      {
        recipe: null,
        tags: {
          artist: ['wlop'],
          character: ['hatsune_miku'],
          general: ['1girl'],
        },
      },
      pick('artist', 'general'),
      CURRENT,
      undefined,
    )
    expect(next.prompt).toBe('artist:wlop, 1girl')
    expect(next.advancedParams).toEqual(CURRENT.advancedParams)
  })
})

describe('applyImageRecipe → NovelAI 目标', () => {
  const NAI_TARGET = {
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    modelId: AI_MODELS.NOVELAI_V45_FULL,
  }
  const HEAVY_V45 =
    'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page'

  // 图里存的是网页端拼好之后的整串；台上的开关还会再拼一遍 → 剥掉、开关拨到同一档。
  it('剥掉配方里已经拼好的质量标签串与 UC 预设串，开关拨到同一档', () => {
    const next = applyImageRecipe(
      {
        recipe: {
          ...NAI.recipe!,
          prompt: '1girl, rain, location, very aesthetic, masterpiece, no text',
          negative: `${HEAVY_V45}, hat`,
          characters: [],
        },
        tags: null,
      },
      pick('positive', 'negative'),
      CURRENT,
      AI_MODELS.NOVELAI_V45_FULL,
      NAI_TARGET,
    )
    expect(next.prompt).toBe('1girl, rain')
    expect(next.advancedParams).toMatchObject({
      negativePrompt: 'hat',
      qualityToggle: 'standard',
      ucPreset: 'heavy',
    })
  })

  // NovelAI 自己的图里认不出预设串 = 当时那颗开关是关的；不关就会多拼一遍官方缺省。
  it('NovelAI 原图里没有预设串 → 两颗开关拨到关', () => {
    const next = applyImageRecipe(
      NAI,
      pick('positive', 'negative'),
      CURRENT,
      AI_MODELS.NOVELAI_V45_FULL,
      NAI_TARGET,
    )
    expect(next.advancedParams).toMatchObject({
      qualityToggle: 'off',
      ucPreset: 'none',
    })
  })

  it('别家（Civitai / A1111）的配方认不出预设串时不碰开关', () => {
    const next = applyImageRecipe(
      { recipe: { ...NAI.recipe!, source: 'a1111' }, tags: null },
      pick('positive', 'negative'),
      CURRENT,
      AI_MODELS.NOVELAI_V45_FULL,
      NAI_TARGET,
    )
    expect(next.advancedParams.qualityToggle).toBeUndefined()
    expect(next.advancedParams.ucPreset).toBeUndefined()
  })

  it('参数按目标模型的能力表夹紧，尺寸落到 NovelAI 的五档上', () => {
    const next = applyImageRecipe(
      {
        recipe: {
          ...NAI.recipe!,
          steps: 80,
          cfg: 30,
          sampler: 'dpmpp_2m_karras_custom',
        },
        tags: null,
      },
      pick('params'),
      CURRENT,
      AI_MODELS.NOVELAI_V45_FULL,
      NAI_TARGET,
    )
    expect(next.advancedParams.steps).toBe(50)
    expect(next.advancedParams.guidanceScale).toBe(20)
    // 认不得的采样器不写，留着原值（这里原本没有）。
    expect(next.advancedParams.sampler).toBeUndefined()
    // 832×1216 是 NAI 的竖版档 9:16；旧逻辑落 3:4 → NAI 实际出 768×1024。
    expect(next.aspectRatio).toBe('9:16')
  })
})
