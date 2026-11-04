/**
 * L2a 真库：提示词模板（Recipe）服务。接口层的增删改查 / 越权已在
 * `src/app/api/recipes/recipes.int.test.ts`；这里只测接口那层看不到的：
 * 改版号、学偏好、从图存（含 LoRA 整套）、血缘快照、封面优先级、LoRA 名字补全、
 * 关联出图、只记最近使用。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildRecipeSnapshotForUser,
  createRecipe,
  createRecipeFromGeneration,
  deleteRecipe,
  listRecipeGenerations,
  listRecipeSummaries,
  listRecipes,
  markRecipeUsed,
  updateRecipe,
} from '@/features/prompts/services/recipe.service'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type User = Awaited<ReturnType<typeof createTestUser>>
let me: User
let other: User

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

const INPUT = {
  compiledPrompt: 'a beautiful sunset',
  modelId: 'flux-2-pro',
  provider: 'fal',
  name: 'My Recipe',
  outputType: 'IMAGE' as const,
}

function generation(
  userId: string,
  data: Partial<Parameters<typeof db.generation.create>[0]['data']> = {},
) {
  return db.generation.create({
    data: {
      userId,
      url: 'https://cdn.test/image.png',
      storageKey: 'image.png',
      prompt: 'A useful prompt',
      negativePrompt: 'low quality',
      model: 'flux-2-pro',
      provider: 'fal',
      ...data,
    } as never,
  })
}

function recipe(userId: string, data: Record<string, unknown> = {}) {
  return db.recipe.create({
    data: {
      userId,
      compiledPrompt: 'p',
      modelId: 'flux-2-pro',
      provider: 'fal',
      ...data,
    } as never,
  })
}

describe('createRecipe / updateRecipe', () => {
  it('存一条记到我名下，并学进创作偏好（这个模型进了偏好列表）', async () => {
    const saved = await createRecipe(me.clerkId, INPUT)

    const row = await db.recipe.findUniqueOrThrow({ where: { id: saved.id } })
    expect(row).toMatchObject({
      userId: me.id,
      compiledPrompt: 'a beautiful sunset',
      version: 1,
    })
    const pref = await db.userCreativePreference.findUniqueOrThrow({
      where: { userId: me.id },
    })
    expect(JSON.stringify(pref.preferredModelsByTask)).toContain('flux-2-pro')
  })

  it('两条都带同一个负面词 → 偏好里记成常用负面词', async () => {
    await createRecipe(me.clerkId, { ...INPUT, negativePrompt: 'blurry, text' })
    await createRecipe(me.clerkId, { ...INPUT, negativePrompt: 'blurry' })

    const pref = await db.userCreativePreference.findUniqueOrThrow({
      where: { userId: me.id },
    })
    expect(pref.commonNegativeTags).toEqual(['blurry'])
  })

  it('改我的：内容落库、版本 +1；别人的 / 已删的 → null，不动', async () => {
    const saved = await createRecipe(me.clerkId, INPUT)

    const updated = await updateRecipe(me.clerkId, saved.id, {
      ...INPUT,
      compiledPrompt: 'an updated sunset prompt',
      negativePrompt: 'blurry',
    })
    expect(updated).toMatchObject({ version: 2, negativePrompt: 'blurry' })

    expect(await updateRecipe(other.clerkId, saved.id, INPUT)).toBeNull()
    await deleteRecipe(me.clerkId, saved.id)
    expect(await updateRecipe(me.clerkId, saved.id, INPUT)).toBeNull()

    const row = await db.recipe.findUniqueOrThrow({ where: { id: saved.id } })
    expect(row).toMatchObject({
      version: 2,
      compiledPrompt: 'an updated sunset prompt',
      isDeleted: true,
    })
  })
})

describe('createRecipeFromGeneration', () => {
  const SNAPSHOT = {
    compiledPrompt: 'A useful prompt',
    modelId: 'flux-2-pro',
    aspectRatio: '16:9',
    advancedParams: { seed: 123 },
    referenceImages: ['https://cdn.test/ref.png'],
  }

  it('照图上的提示词 / 负面 / 型号 / 比例 / 参考图 / seed 存；名字缺省取提示词', async () => {
    const source = await generation(me.id, {
      snapshot: SNAPSHOT,
      seed: BigInt(123),
    })

    const saved = await createRecipeFromGeneration(me.clerkId, {
      generationId: source.id,
    })

    const row = await db.recipe.findUniqueOrThrow({ where: { id: saved.id } })
    expect(row).toMatchObject({
      userId: me.id,
      name: 'A useful prompt',
      compiledPrompt: 'A useful prompt',
      negativePrompt: 'low quality',
      modelId: 'flux-2-pro',
      parentGenerationId: source.id,
      seed: BigInt(123),
      params: { aspectRatio: '16:9', advancedParams: { seed: 123 } },
      referenceAssets: [
        { url: 'https://cdn.test/ref.png', role: 'composition' },
      ],
    })
  })

  it('给了名字就用；不勾参数 / 负面 / 参考图就都不带', async () => {
    const source = await generation(me.id, { snapshot: SNAPSHOT })

    const saved = await createRecipeFromGeneration(me.clerkId, {
      generationId: source.id,
      name: ' 夕阳 ',
      include: { params: false, negative: false, references: false },
    })

    const row = await db.recipe.findUniqueOrThrow({ where: { id: saved.id } })
    expect(row).toMatchObject({
      name: '夕阳',
      negativePrompt: null,
      params: {},
      referenceAssets: null,
    })
  })

  it('别人的图 → 404，不落库', async () => {
    const theirs = await generation(other.id)
    await expect(
      createRecipeFromGeneration(me.clerkId, { generationId: theirs.id }),
    ).rejects.toMatchObject({
      errorCode: 'GENERATION_NOT_FOUND',
      httpStatus: 404,
    })
    expect(await db.recipe.count()).toBe(0)
  })

  describe('LoRA 台「存成模板」带上整套', () => {
    const SUE_URL = 'https://civitai.com/api/download/models/111'
    const EYES_URL = 'https://civitai.com/api/download/models/222'
    const loraAsset = (id: string, name: string, loraUrl: string) => ({
      id,
      styleCode: '',
      name,
      source: 'imported' as const,
      type: 'subject' as const,
      baseModelFamily: 'Illustrious',
      provider: 'civitai',
      triggerWord: 'sue',
      loraUrl,
      coverImageUrl: null,
      previewImageUrls: [],
      defaultScale: 1,
      isPublic: false,
      isOwn: false,
      createdAt: '2026-09-28T00:00:00.000Z',
    })
    const LORA_SETUP = {
      baseId: 'illustrious-runner',
      items: [
        { asset: loraAsset('civitai:1', '祀 (Sue)', SUE_URL), scale: 0.9 },
        {
          asset: loraAsset('civitai:2', 'Enchanting Eyes', EYES_URL),
          scale: 0.8,
        },
      ],
    }
    const loraSnapshot = (urls: string[]) => ({
      ...SNAPSHOT,
      advancedParams: {
        seed: 123,
        loras: urls.map((url) => ({ url, scale: 0.8 })),
      },
    })

    it('存进 params.loraSetup，与这张图发出去的参数放在一起', async () => {
      const source = await generation(me.id, {
        snapshot: loraSnapshot([EYES_URL, SUE_URL]),
      })

      const saved = await createRecipeFromGeneration(me.clerkId, {
        generationId: source.id,
        loraSetup: LORA_SETUP,
      })

      const row = await db.recipe.findUniqueOrThrow({ where: { id: saved.id } })
      expect(row.params).toMatchObject({
        aspectRatio: '16:9',
        loraSetup: LORA_SETUP,
      })
    })

    it('和这张图实际用的对不上就拒（出图之后装配台又动过），不落库', async () => {
      const source = await generation(me.id, {
        snapshot: loraSnapshot([SUE_URL]),
      })

      await expect(
        createRecipeFromGeneration(me.clerkId, {
          generationId: source.id,
          loraSetup: LORA_SETUP,
        }),
      ).rejects.toMatchObject({
        errorCode: 'RECIPE_LORA_SETUP_MISMATCH',
        httpStatus: 400,
      })
      expect(await db.recipe.count()).toBe(0)
    })
  })
})

describe('buildRecipeSnapshotForUser', () => {
  it('给出可复用的血缘快照', async () => {
    const parent = await generation(me.id)
    const saved = await recipe(me.id, {
      name: 'My Recipe',
      compiledPrompt: 'a beautiful sunset',
      parentGenerationId: parent.id,
    })

    expect(
      await buildRecipeSnapshotForUser(me.id, {
        recipeId: saved.id,
        recipeVersion: 1,
        useMode: 'apply',
      }),
    ).toEqual(
      expect.objectContaining({
        sourceType: 'prompt_template',
        recipeId: saved.id,
        recipeVersion: 1,
        useMode: 'apply',
        compiledPrompt: 'a beautiful sunset',
        parentGenerationId: parent.id,
      }),
    )
  })

  it('别人的 / 已删的 → 404', async () => {
    const theirs = await recipe(other.id)
    const deleted = await recipe(me.id, { isDeleted: true })
    for (const id of [theirs.id, deleted.id, 'missing']) {
      await expect(
        buildRecipeSnapshotForUser(me.id, { recipeId: id, useMode: 'apply' }),
      ).rejects.toMatchObject({
        errorCode: 'RECIPE_NOT_FOUND',
        httpStatus: 404,
      })
    }
  })
})

describe('封面（listRecipes / listRecipeSummaries）', () => {
  it('列表载荷不带参考图', async () => {
    await recipe(me.id, {
      referenceAssets: [{ url: 'x', role: 'composition' }],
    })
    const { recipes, total } = await listRecipes(me.clerkId, 1, 20)
    expect(total).toBe(1)
    expect(recipes[0]).not.toHaveProperty('referenceAssets')
  })

  it('优先级：用它出的第一张 > 存自的那张 > 自己存的封面 > 没有', async () => {
    const parent = await generation(me.id, {
      thumbnailUrl: 'https://cdn.test/parent.thumb.webp',
    })
    const withRuns = await recipe(me.id, { parentGenerationId: parent.id })
    const parentOnly = await recipe(me.id, { parentGenerationId: parent.id })
    const stored = await recipe(me.id, {
      coverImageUrl: 'https://cdn.test/stored.webp',
    })
    const bare = await recipe(me.id)
    await generation(me.id, {
      thumbnailUrl: 'https://cdn.test/first.thumb.webp',
      recipeSnapshot: { recipeId: withRuns.id },
      createdAt: new Date('2026-01-01'),
    })
    await generation(me.id, {
      thumbnailUrl: 'https://cdn.test/second.thumb.webp',
      recipeSnapshot: { recipeId: withRuns.id },
      createdAt: new Date('2026-02-01'),
    })
    // 别人用我的模板 id 出的图不算
    await generation(other.id, {
      thumbnailUrl: 'https://cdn.test/theirs.webp',
      recipeSnapshot: { recipeId: bare.id },
    })

    const expected = {
      [withRuns.id]: 'https://cdn.test/first.thumb.webp',
      [parentOnly.id]: 'https://cdn.test/parent.thumb.webp',
      [stored.id]: 'https://cdn.test/stored.webp',
      [bare.id]: null,
    }
    const { recipes } = await listRecipes(me.clerkId, 1, 20)
    expect(
      Object.fromEntries(recipes.map((r) => [r.id, r.coverThumbnailUrl])),
    ).toEqual(expected)
    const summaries = await listRecipeSummaries(me.clerkId, 1, 20)
    expect(
      Object.fromEntries(summaries.map((r) => [r.id, r.coverThumbnailUrl])),
    ).toEqual(expected)
  })

  it('视频 / 音频只认缩略图，⛔ 拿原文件地址当封面', async () => {
    const video = await generation(me.id, {
      outputType: 'VIDEO',
      url: 'https://cdn.test/clip.mp4',
    })
    const audio = await generation(me.id, {
      outputType: 'AUDIO',
      url: 'https://cdn.test/voice.mp3',
    })
    const poster = await generation(me.id, {
      outputType: 'VIDEO',
      url: 'https://cdn.test/clip2.mp4',
      thumbnailUrl: 'https://cdn.test/clip.poster.webp',
    })
    const rv = await recipe(me.id, { parentGenerationId: video.id })
    const ra = await recipe(me.id, { parentGenerationId: audio.id })
    const rp = await recipe(me.id, { parentGenerationId: poster.id })

    const { recipes } = await listRecipes(me.clerkId, 1, 20)
    expect(
      Object.fromEntries(recipes.map((r) => [r.id, r.coverThumbnailUrl])),
    ).toEqual({
      [rv.id]: null,
      [ra.id]: null,
      [rp.id]: 'https://cdn.test/clip.poster.webp',
    })
  })
})

describe('listRecipeSummaries 的类型与 LoRA', () => {
  it('普通模板：IMAGE、没有来处、没有 LoRA', async () => {
    await recipe(me.id)
    const [summary] = await listRecipeSummaries(me.clerkId, 1, 20)
    expect(summary).toMatchObject({
      templateKind: 'IMAGE',
      tagSource: null,
      lora: null,
      isFavorite: false,
      lastUsedAt: null,
    })
  })

  it('LoRA 模板带「名字 权重」：新存的读整套，旧存的按链接去我的 / 平台的 LoRA 补名字', async () => {
    const OLD_URL = 'https://civitai.com/api/download/models/222'
    const MISSING_URL = 'https://civitai.com/api/download/models/333'
    const THEIRS_URL = 'https://civitai.com/api/download/models/444'
    await db.loraAsset.create({
      data: {
        userId: me.id,
        name: 'Watercolor',
        styleCode: 'pv-watercolor',
        triggerWord: 'wc',
        loraUrl: OLD_URL,
      },
    })
    await db.loraAsset.create({
      data: {
        userId: other.id,
        name: '别人的',
        styleCode: 'pv-theirs',
        triggerWord: 't',
        loraUrl: THEIRS_URL,
      },
    })
    const fresh = await recipe(me.id, {
      createdAt: new Date('2026-02-01'),
      params: {
        loraSetup: {
          baseId: 'illustrious-runner',
          items: [
            {
              asset: {
                id: 'civitai:1',
                styleCode: '',
                name: '祀 (Sue)',
                source: 'imported',
                type: 'subject',
                baseModelFamily: 'Illustrious',
                provider: 'civitai',
                triggerWord: 'sue',
                loraUrl: 'https://civitai.com/api/download/models/111',
                coverImageUrl: null,
                previewImageUrls: [],
                defaultScale: 1,
                isPublic: false,
                isOwn: false,
                createdAt: '2026-09-28T00:00:00.000Z',
              },
              scale: 0.9,
            },
          ],
        },
      },
    })
    const legacy = await recipe(me.id, {
      createdAt: new Date('2026-01-01'),
      params: {
        advancedParams: {
          loras: [
            { url: OLD_URL, scale: 0.6 },
            { url: MISSING_URL },
            { url: THEIRS_URL, scale: 0.5 },
          ],
        },
      },
    })

    const byId = Object.fromEntries(
      (await listRecipeSummaries(me.clerkId, 1, 20)).map((r) => [r.id, r]),
    )

    expect(byId[fresh.id]).toMatchObject({
      templateKind: 'TAGS',
      tagSource: 'lora',
      lora: {
        baseId: 'illustrious-runner',
        items: [{ name: '祀 (Sue)', scale: 0.9 }],
      },
    })
    expect(byId[legacy.id]).toMatchObject({
      templateKind: 'TAGS',
      tagSource: 'lora',
      lora: {
        baseId: null,
        items: [
          { name: 'Watercolor', scale: 0.6 },
          { name: null, scale: 1 },
          { name: null, scale: 0.5 },
        ],
      },
    })
  })
})

describe('listRecipeGenerations', () => {
  it('列出存自的那张和用它出的，不含别人的、无关的', async () => {
    const parent = await generation(me.id)
    const saved = await recipe(me.id, { parentGenerationId: parent.id })
    const derived = await generation(me.id, {
      recipeSnapshot: { recipeId: saved.id },
    })
    await generation(me.id)
    await generation(other.id, { recipeSnapshot: { recipeId: saved.id } })

    const result = await listRecipeGenerations(me.clerkId, saved.id)
    expect(result.map((g) => g.id).sort()).toEqual(
      [parent.id, derived.id].sort(),
    )
  })

  it('不是我的模板 → 空', async () => {
    const theirs = await recipe(other.id)
    await generation(other.id, { recipeSnapshot: { recipeId: theirs.id } })
    expect(await listRecipeGenerations(me.clerkId, theirs.id)).toEqual([])
  })
})

describe('markRecipeUsed', () => {
  it('只记最近使用时间，⛔ 动 usageCount（那是旧共享库的复制计数）', async () => {
    const saved = await recipe(me.id, { usageCount: 7 })

    const result = await markRecipeUsed(me.clerkId, saved.id)

    expect(result?.id).toBe(saved.id)
    const row = await db.recipe.findUniqueOrThrow({ where: { id: saved.id } })
    expect(row.lastUsedAt).toEqual(result?.lastUsedAt)
    expect(row.usageCount).toBe(7)
    expect(row.version).toBe(1)
  })

  it('不是自己的 / 已删的返回 null，不写', async () => {
    const theirs = await recipe(other.id)
    const deleted = await recipe(me.id, { isDeleted: true })

    expect(await markRecipeUsed(me.clerkId, theirs.id)).toBeNull()
    expect(await markRecipeUsed(me.clerkId, deleted.id)).toBeNull()
    expect(
      await db.recipe.count({ where: { lastUsedAt: { not: null } } }),
    ).toBe(0)
  })
})
