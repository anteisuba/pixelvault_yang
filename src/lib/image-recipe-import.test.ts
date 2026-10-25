import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models/enum'
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
