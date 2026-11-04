import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_RECIPE_LIMITS } from '@/constants/assistant-v3'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
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

/** 这个人在这儿出的一张图（真库里的一行）。 */
const OWN_ROW = {
  url: 'https://cdn.test/full.png',
  thumbnailUrl: 'https://cdn.test/thumb.webp',
  prompt: 'silver hair',
  model: 'gemini-3-image',
  width: 832,
  height: 1216,
}
const OWN_RECIPE =
  'silver hair\nSteps: 30, CFG scale: 6, Size: 832x1216, Model: gemini-3-image'

let userId = ''

async function seedOwnPicture(owner: string, extra: object = {}) {
  await db.generation.create({
    data: {
      ...OWN_ROW,
      userId: owner,
      storageKey: 'full.png',
      provider: 'fal',
      snapshot: { advancedParams: { steps: 30, guidanceScale: 6 } },
      ...extra,
    },
  })
}

beforeEach(async () => {
  await resetDatabase()
  userId = (await createTestUser()).id
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
    await seedOwnPicture(userId)
    const recipes = await readOwnRecipes(userId, [
      'https://cdn.test/thumb.webp',
      'https://cdn.test/other.png',
    ])
    expect([...recipes]).toEqual([['https://cdn.test/thumb.webp', OWN_RECIPE]])
  })

  it('别人的图、自己传上来的图都不算「在这儿出的」', async () => {
    const stranger = await createTestUser()
    await seedOwnPicture(stranger.id)
    await seedOwnPicture(userId, {
      url: 'https://cdn.test/upload.png',
      thumbnailUrl: null,
      provider: USER_UPLOAD_PROVIDER,
    })
    const recipes = await readOwnRecipes(userId, [
      OWN_ROW.url,
      'https://cdn.test/upload.png',
    ])
    expect(recipes.size).toBe(0)
  })

  it('一个地址都没有就是空', async () => {
    expect((await readOwnRecipes(userId, [])).size).toBe(0)
  })

  it('查库失败只是少一段字，⛔ 不抛', async () => {
    // Postgres 的文本收不下 `\u0000`：让查询真报错。
    expect(
      (await readOwnRecipes(userId, ['https://x.test/a\u0000.png'])).size,
    ).toBe(0)
  })
})

describe('readPictureRecipes / renderPictureRecipes', () => {
  it('两样都有就都给，都没有的不提', async () => {
    await seedOwnPicture(userId)
    const recipes = await readPictureRecipes(userId, [
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
        madeHere: OWN_RECIPE,
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
