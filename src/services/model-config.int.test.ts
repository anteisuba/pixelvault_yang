/**
 * L2a 真库：模型配置（model-config.service）。ModelConfig 行真存真读，
 * 与内置名册合并的结果、改动后库里的那一行都核。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_MODELS } from '@/constants/models'
import { db } from '@/lib/db'
import {
  getAllModelConfigs,
  getModelConfigById,
  getResolvedModelOption,
  getResolvedModelOptions,
  updateModelConfig,
  updateModelHealthStatus,
} from '@/services/model-config.service'
import { resetDatabase } from '@/test/int/db'

beforeEach(async () => {
  await resetDatabase()
})

function seedConfig(
  modelId: string,
  extra: Partial<{
    externalModelId: string
    adapterType: string
    cost: number
    available: boolean
    sortOrder: number
    providerConfig: { label: string; baseUrl: string }
  }> = {},
) {
  return db.modelConfig.create({
    data: {
      modelId,
      externalModelId: 'fal-ai/flux-pro/v1.1',
      adapterType: 'fal',
      providerConfig: { label: 'FAL', baseUrl: 'https://fal.run' },
      ...extra,
    },
  })
}

describe('读配置（真库）', () => {
  it('列全部按 sortOrder；按 id 读，没有回 null', async () => {
    await seedConfig('seedream-5.0-pro', { sortOrder: 2 })
    await seedConfig('veo-3.1', { sortOrder: 1 })
    expect((await getAllModelConfigs()).map((c) => c.modelId)).toEqual([
      'veo-3.1',
      'seedream-5.0-pro',
    ])
    expect(await getModelConfigById('missing-model')).toBeNull()
    expect(await getModelConfigById('seedream-5.0-pro')).toMatchObject({
      modelId: 'seedream-5.0-pro',
      adapterType: 'fal',
    })
  })
})

describe('getResolvedModelOptions（真库 + 内置名册）', () => {
  it('改过名的旧行不出现，回到内置的新名字', async () => {
    await seedConfig('veo-3', { externalModelId: 'fal-ai/veo3' })
    const ids = (await getResolvedModelOptions()).map((model) => model.id)
    expect(ids).toContain('veo-3.1')
    expect(ids).not.toContain('veo-3')
  })

  it('退役的模型：库里开着也只留内置那条（停用）', async () => {
    await seedConfig(AI_MODELS.ANIMA_PENCIL_XL, {
      externalModelId: 'custom/anima',
      available: true,
    })
    const anima = (await getResolvedModelOptions()).filter(
      (model) => model.id === AI_MODELS.ANIMA_PENCIL_XL,
    )
    expect(anima).toHaveLength(1)
    expect(anima[0]).toMatchObject({
      available: false,
      externalModelId: 'lucataco/animapencil-xl-v4',
    })
  })
})

describe('getResolvedModelOption（真库）', () => {
  it('暂停的 PixAI：旧库行开着也还是不可用', async () => {
    await seedConfig(AI_MODELS.PIXAI_TSUBAKI_2, {
      adapterType: 'pixai',
      available: true,
    })
    expect(
      (await getResolvedModelOption(AI_MODELS.PIXAI_TSUBAKI_2))?.available,
    ).toBe(false)
    expect(
      (await getResolvedModelOptions()).find(
        (model) => model.id === AI_MODELS.PIXAI_TSUBAKI_2,
      )?.available,
    ).toBe(false)
  })

  it('库里的执行参数盖在内置模型上', async () => {
    await seedConfig('seedream-5.0-pro', {
      externalModelId: 'fal-ai/flux-pro/new-version',
      adapterType: 'replicate',
      cost: 7,
      available: false,
      providerConfig: {
        label: 'Replicate',
        baseUrl: 'https://api.replicate.com',
      },
    })
    expect(await getResolvedModelOption('seedream-5.0-pro')).toMatchObject({
      id: 'seedream-5.0-pro',
      externalModelId: 'fal-ai/flux-pro/new-version',
      adapterType: 'replicate',
      cost: 7,
      available: false,
      providerConfig: {
        label: 'Replicate',
        baseUrl: 'https://api.replicate.com',
      },
    })
  })
})

describe('改配置（真库）', () => {
  it('只改给了的那几格；健康状态带上检查时间', async () => {
    await seedConfig('seedream-5.0-pro', { cost: 3 })
    const updated = await updateModelConfig('seedream-5.0-pro', {
      available: false,
    })
    expect(updated).toMatchObject({ available: false, cost: 3 })

    await updateModelHealthStatus('seedream-5.0-pro', 'degraded')
    await updateModelHealthStatus('not-in-db', 'degraded')
    const row = await db.modelConfig.findUniqueOrThrow({
      where: { modelId: 'seedream-5.0-pro' },
    })
    expect(row).toMatchObject({
      available: false,
      cost: 3,
      healthStatus: 'degraded',
    })
    expect(row.lastHealthCheck).not.toBeNull()
    expect(await db.modelConfig.count()).toBe(1)
  })
})
