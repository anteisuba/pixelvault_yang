/**
 * L2a 真库：作品配方（generation-recipe.service）。LoRA 补全从真库的 LoraAsset 读
 * （本人的优先于平台的，别人的不读），读配方从真库的作品读（只读本人的）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import {
  buildImageRecipeDraft,
  buildVideoRecipeDraft,
  finalizeGenerationRecipe,
  readGenerationRecipe,
} from '@/services/generation-recipe.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

let code = 0
function seedLora(
  userId: string | null,
  loraUrl: string,
  extra: Partial<{
    name: string
    baseModelFamily: string
    triggerWord: string
    civitaiModelId: number
    civitaiModelVersionId: number
  }> = {},
) {
  code += 1
  return db.loraAsset.create({
    data: {
      userId,
      loraUrl,
      name: `lora ${code}`,
      styleCode: `pv-test-${code}`,
      triggerWord: '',
      ...extra,
    },
  })
}

describe('buildImageRecipeDraft（真库 LoRA）', () => {
  it('留下工作台输入、去掉服务端注入的 runner 字段；LoRA 本人的优先于平台的，别人的不读', async () => {
    await seedLora(null, 'https://civitai.com/a', {
      name: 'Platform copy',
      baseModelFamily: 'sdxl',
    })
    const mine = await seedLora(me.id, 'https://civitai.com/a', {
      name: 'My Style',
      baseModelFamily: 'illustrious',
      triggerWord: 'mystyle',
      civitaiModelId: 11,
      civitaiModelVersionId: 22,
    })
    await seedLora(other.id, 'https://example.com/b.safetensors', {
      name: 'Not mine',
    })
    const platformOnly = await seedLora(null, 'https://civitai.com/c', {
      name: 'Platform C',
      baseModelFamily: 'sdxl',
    })

    const recipe = await buildImageRecipeDraft({
      userId: me.id,
      modelId: 'runner-illustrious',
      prompt: '1girl, smile',
      aspectRatio: '3:4',
      advancedParams: {
        negativePrompt: 'lowres',
        steps: 28,
        loras: [
          { url: 'https://civitai.com/a', scale: 0.8 },
          { url: 'https://example.com/b.safetensors' },
          { url: 'https://civitai.com/c' },
        ],
        runnerLoras: [{ filename: 'a', downloadUrl: 'https://signed' }],
        runnerCheckpoint: { url: 'https://signed' },
      },
      referenceImages: [],
    })

    expect(recipe).toMatchObject({
      version: 1,
      kind: 'image',
      modelId: 'runner-illustrious',
      prompt: '1girl, smile',
      negativePrompt: 'lowres',
      aspectRatio: '3:4',
      seedSource: 'unknown',
    })
    expect(recipe.loras).toEqual([
      {
        url: 'https://civitai.com/a',
        scale: 0.8,
        loraAssetId: mine.id,
        name: 'My Style',
        baseModelFamily: 'illustrious',
        triggerWord: 'mystyle',
        civitaiModelId: 11,
        civitaiModelVersionId: 22,
      },
      { url: 'https://example.com/b.safetensors' },
      {
        url: 'https://civitai.com/c',
        loraAssetId: platformOnly.id,
        name: 'Platform C',
        baseModelFamily: 'sdxl',
      },
    ])
    expect(recipe.advancedParams).not.toHaveProperty('runnerLoras')
    expect(recipe.advancedParams).not.toHaveProperty('runnerCheckpoint')
    expect(recipe.referenceImages).toBeUndefined()
  })

  it('用户自己填的 seed 记成 user', async () => {
    const recipe = await buildImageRecipeDraft({
      userId: me.id,
      modelId: 'nai-v5',
      prompt: 'cat',
      advancedParams: { seed: 42 },
    })
    expect(recipe).toMatchObject({ seed: 42, seedSource: 'user' })
  })
})

describe('finalizeGenerationRecipe', () => {
  it('用户留随机时记下 provider 给的 seed', () => {
    const draft = buildVideoRecipeDraft({
      modelId: 'kling',
      prompt: 'run',
      duration: 5,
    })
    expect(finalizeGenerationRecipe(draft, 1234)).toMatchObject({
      seed: 1234,
      seedSource: 'provider',
    })
  })

  it('不盖用户的 seed', () => {
    const draft = buildVideoRecipeDraft({
      modelId: 'kling',
      prompt: 'run',
      seed: 7,
    })
    expect(finalizeGenerationRecipe(draft, 1234)).toMatchObject({
      seed: 7,
      seedSource: 'user',
    })
  })

  it('读不懂的草稿丢掉，不让收尾失败', () => {
    expect(finalizeGenerationRecipe({ kind: 'nope' }, 1)).toBeUndefined()
    expect(finalizeGenerationRecipe(undefined, 1)).toBeUndefined()
  })
})

describe('readGenerationRecipe（真库）', () => {
  it('别人的、没有的作品回 null', async () => {
    const theirs = await seedGeneration(other.id, {
      recipe: {
        version: 1,
        kind: 'image',
        modelId: 'nai-v5',
        prompt: 'cat',
      },
    })
    expect(await readGenerationRecipe(theirs.id, me.id)).toBeNull()
    expect(await readGenerationRecipe('missing', me.id)).toBeNull()
  })

  it('存了配方的直接读，没缺口', async () => {
    const gen = await seedGeneration(me.id, {
      outputType: 'IMAGE',
      model: 'nai-v5',
      recipe: {
        version: 1,
        kind: 'image',
        modelId: 'nai-v5',
        prompt: 'cat',
        seed: 99,
        seedSource: 'provider',
      },
    })
    expect(await readGenerationRecipe(gen.id, me.id)).toEqual({
      generationId: gen.id,
      source: 'stored',
      recipe: expect.objectContaining({ seed: 99 }),
      gaps: [],
    })
  })

  it('旧图从 snapshot 推出配方，说清缺什么', async () => {
    const gen = await seedGeneration(me.id, {
      outputType: 'IMAGE',
      prompt: 'cat',
      model: 'runner-sdxl',
      snapshot: {
        compiledPrompt: 'cat, masterpiece',
        modelId: 'runner-sdxl',
        // 旧 schema 不认的比例：整份 safeParse 会失败，仍要读出提示词和参数。
        aspectRatio: '2:3',
        advancedParams: {
          loras: [{ url: 'https://civitai.com/a', scale: 1 }],
        },
        referenceImages: ['https://cdn.test/ref.png'],
      },
    })
    expect(await readGenerationRecipe(gen.id, me.id)).toMatchObject({
      source: 'derived',
      recipe: {
        kind: 'image',
        prompt: 'cat, masterpiece',
        aspectRatio: '2:3',
        referenceImages: ['https://cdn.test/ref.png'],
        loras: [{ url: 'https://civitai.com/a', scale: 1 }],
      },
      gaps: ['seed', 'loraDetails'],
    })
  })

  it('旧视频：整份配方缺', async () => {
    const gen = await seedGeneration(me.id, {
      outputType: 'VIDEO',
      prompt: 'run',
      model: 'kling',
      snapshot: { executionCallback: {} },
    })
    expect(await readGenerationRecipe(gen.id, me.id)).toMatchObject({
      source: 'none',
      recipe: null,
      gaps: ['recipe'],
    })
  })
})
