import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_RECIPE_LIMITS } from '@/constants/assistant-v3'

vi.mock('server-only', () => ({}))

const { queryRaw } = vi.hoisted(() => ({
  queryRaw: vi.fn(async (): Promise<unknown[]> => []),
}))

vi.mock('@/lib/db', () => ({ db: { $queryRaw: queryRaw } }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { png, tEXt, zTXt } from '@/test/png-fixture'
import {
  fileRecipeOf,
  readOwnRecipes,
  readPictureRecipes,
  renderPictureRecipes,
} from './assistant-v3-recipes.service'

function picture(bytes: Uint8Array, mediaType = 'image/png') {
  return { data: Buffer.from(bytes), mediaType, width: 1, height: 1 }
}

const OWN_ROW = {
  url: 'https://cdn.test/full.png',
  thumbnailUrl: 'https://cdn.test/thumb.webp',
  prompt: 'silver hair',
  negativePrompt: null,
  model: 'gemini-3-image',
  width: 832,
  height: 1216,
  seed: null,
  advancedParams: { steps: 30, guidanceScale: 6 },
}

beforeEach(() => {
  queryRaw.mockReset()
  queryRaw.mockResolvedValue([])
})

describe('fileRecipeOf', () => {
  it('PNG 里写的配方（压缩的块也解开）', () => {
    const bytes = png(zTXt('prompt', 'a cat on a roof'))
    expect(fileRecipeOf(picture(bytes))).toBe('prompt: a cat on a roof')
  })

  it('不是 PNG、没写配方都是 null', () => {
    expect(fileRecipeOf(picture(png(tEXt('x', 'y')), 'image/jpeg'))).toBeNull()
    expect(fileRecipeOf(picture(png()))).toBeNull()
  })
})

describe('readOwnRecipes', () => {
  it('原图地址、缩略图地址都认，配方与「复制配方」同一段字', async () => {
    queryRaw.mockResolvedValue([OWN_ROW])
    const recipes = await readOwnRecipes('user-1', [
      'https://cdn.test/thumb.webp',
      'https://cdn.test/other.png',
    ])
    expect([...recipes]).toEqual([
      [
        'https://cdn.test/thumb.webp',
        'silver hair\nSteps: 30, CFG scale: 6, Size: 832x1216, Model: gemini-3-image',
      ],
    ])
  })

  it('一个地址都没有就不查库', async () => {
    expect((await readOwnRecipes('user-1', [])).size).toBe(0)
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('查库失败只是少一段字，⛔ 不抛', async () => {
    queryRaw.mockRejectedValue(new Error('db down'))
    expect(
      (await readOwnRecipes('user-1', ['https://x.test/a.png'])).size,
    ).toBe(0)
  })
})

describe('readPictureRecipes / renderPictureRecipes', () => {
  it('两样都有就都给，都没有的不提', async () => {
    queryRaw.mockResolvedValue([OWN_ROW])
    const recipes = await readPictureRecipes('user-1', [
      {
        url: OWN_ROW.url,
        label: 'mine',
        picture: picture(png(tEXt('parameters', 'silver hair, Steps: 30'))),
      },
      { url: 'https://x.test/plain.png', label: 'plain', picture: null },
    ])
    expect(recipes).toEqual([
      {
        label: 'mine',
        madeHere:
          'silver hair\nSteps: 30, CFG scale: 6, Size: 832x1216, Model: gemini-3-image',
        savedInFile: 'parameters: silver hair, Steps: 30',
      },
    ])
    expect(renderPictureRecipes('HEAD', recipes)).toBe(
      [
        'HEAD',
        "「mine」 — made here, the creator's own work:",
        'silver hair',
        'Steps: 30, CFG scale: 6, Size: 832x1216, Model: gemini-3-image',
        '「mine」 — saved inside the file by the tool that made it:',
        'parameters: silver hair, Steps: 30',
      ].join('\n'),
    )
  })

  it('没有配方是空字；整段截在每轮上限', () => {
    expect(renderPictureRecipes('HEAD', [])).toBe('')
    const long = 'x'.repeat(ASSISTANT_V3_RECIPE_LIMITS.maxTurnChars)
    const text = renderPictureRecipes('HEAD', [
      { label: 'a', madeHere: long, savedInFile: null },
    ])
    expect(text.endsWith('…[cut]')).toBe(true)
    expect(text.length).toBe(ASSISTANT_V3_RECIPE_LIMITS.maxTurnChars + 6)
  })
})
