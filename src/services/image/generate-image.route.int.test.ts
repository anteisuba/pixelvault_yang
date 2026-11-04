/**
 * L2a 真库：出图选路（`resolveGenerationRoute`）。
 * key 是真加密入库的行，型号目录可被 `ModelConfig` 行覆盖，Runner 额度数真任务行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// Comfy Runner 档在线上开着；型号目录在模块加载时读这个开关。
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FF_COMFY_RUNNER = 'true'
})

import { RUNNER_MONTHLY_LIMIT } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { encryptApiKey } from '@/lib/crypto'
import { db } from '@/lib/db'
import { resolveGenerationRoute } from '@/services/image/generate-image.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

const PLAIN_KEY = 'sk-test-not-a-real-key'
const GEMINI = AI_MODELS.GEMINI_NANO_BANANA_21

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('resolveGenerationRoute · 选中的 key', () => {
  it('用她选的那把 key（真解密），不算平台白送', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)

    const route = await resolveGenerationRoute(me.id, {
      modelId: GEMINI,
      apiKeyId: key.id,
    })

    expect(route).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      apiKey: PLAIN_KEY,
      resolvedApiKeyId: key.id,
    })
    expect(route.isFreeGeneration).toBeUndefined()
  })

  it('那把 key 不在 / 是别人的：INVALID_ROUTE_SELECTION', async () => {
    const other = await createTestUser()
    const foreign = await seedAssistantKey(other.id, AI_ADAPTER_TYPES.GEMINI)

    for (const apiKeyId of ['no-such-key', foreign.id])
      await expect(
        resolveGenerationRoute(me.id, { modelId: GEMINI, apiKeyId }),
      ).rejects.toMatchObject({ code: 'INVALID_ROUTE_SELECTION' })
  })

  it('key 的厂商和型号对不上：INVALID_ROUTE_SELECTION', async () => {
    const fal = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)

    await expect(
      resolveGenerationRoute(me.id, { modelId: GEMINI, apiKeyId: fal.id }),
    ).rejects.toMatchObject({ code: 'INVALID_ROUTE_SELECTION' })
  })

  it('自定义型号号也绕不过 PixAI 暂停', async () => {
    const pixai = await db.userApiKey.create({
      data: {
        userId: me.id,
        adapterType: AI_ADAPTER_TYPES.PIXAI,
        modelId: 'custom-pixai-version',
        providerConfig: JSON.parse(
          JSON.stringify(getDefaultProviderConfig(AI_ADAPTER_TYPES.PIXAI)),
        ),
        label: 'pixai',
        encryptedKey: encryptApiKey(PLAIN_KEY),
      },
    })

    await expect(
      resolveGenerationRoute(me.id, {
        modelId: 'custom-pixai-version',
        apiKeyId: pixai.id,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL', status: 400 })
  })
})

describe('resolveGenerationRoute · 没选 key', () => {
  it('自动找她这一家在用的 key', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)

    const route = await resolveGenerationRoute(me.id, { modelId: GEMINI })

    expect(route).toMatchObject({ apiKey: PLAIN_KEY, resolvedApiKeyId: key.id })
  })

  it('她没有这一家的 key：MISSING_API_KEY —— 环境里有平台 key 也不用（出图没有平台免费档）', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'platform-key')
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)

    await expect(
      resolveGenerationRoute(me.id, { modelId: GEMINI }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })

  it('不认识的型号又没选 key：CUSTOM_MODEL_REQUIRES_ROUTE', async () => {
    await expect(
      resolveGenerationRoute(me.id, { modelId: 'my-custom-model' }),
    ).rejects.toMatchObject({ code: 'CUSTOM_MODEL_REQUIRES_ROUTE' })
  })
})

describe('resolveGenerationRoute · 型号目录', () => {
  it('退役的内置型号：先拒，不去找 key', async () => {
    const findFirst = vi.spyOn(db.userApiKey, 'findFirst')

    await expect(
      resolveGenerationRoute(me.id, { modelId: AI_MODELS.ANIMA_PENCIL_XL }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL' })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it.each([
    AI_MODELS.PIXAI_TSUBAKI_2,
    AI_MODELS.PIXAI_HARUKA_V2,
    AI_MODELS.PIXAI_HOSHINO_V2,
  ])('暂停的 PixAI 型号 %s：选了 key 也拒', async (modelId) => {
    await expect(
      resolveGenerationRoute(me.id, { modelId, apiKeyId: 'pixai-key' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL', status: 400 })
  })

  it('库里的目录把型号标成下架：立即拒', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
    await db.modelConfig.create({
      data: {
        modelId: AI_MODELS.SEEDREAM_50_PRO,
        externalModelId: 'fal-ai/seedream',
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: JSON.parse(
          JSON.stringify(getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL)),
        ),
        available: false,
      },
    })

    await expect(
      resolveGenerationRoute(me.id, { modelId: AI_MODELS.SEEDREAM_50_PRO }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL' })
  })

  it('库里的目录改了厂商 / 外部型号号 / 价钱：选路照库里的走', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.REPLICATE)
    await db.modelConfig.create({
      data: {
        modelId: AI_MODELS.SEEDREAM_50_PRO,
        externalModelId: 'owner/flux-new-version',
        adapterType: AI_ADAPTER_TYPES.REPLICATE,
        providerConfig: JSON.parse(
          JSON.stringify(getDefaultProviderConfig(AI_ADAPTER_TYPES.REPLICATE)),
        ),
        cost: 7,
      },
    })

    const route = await resolveGenerationRoute(me.id, {
      modelId: AI_MODELS.SEEDREAM_50_PRO,
      apiKeyId: key.id,
    })

    expect(route).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.REPLICATE,
      externalModelId: 'owner/flux-new-version',
      creditCost: 7,
    })
  })
})

describe('resolveGenerationRoute · Comfy Runner', () => {
  it('不要供应商 key，额度内放行', async () => {
    const route = await resolveGenerationRoute(me.id, {
      modelId: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
    })

    expect(route).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      apiKey: '',
      resolvedApiKeyId: null,
      isFreeGeneration: false,
    })
  })

  it('Qwen 走同一份 Runner 额度，生产环境下任何账号都能用', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PLATFORM_GENERATION_ENABLED', 'true')

    const route = await resolveGenerationRoute(me.id, {
      modelId: AI_MODELS.QWEN_IMAGE_21_RUNNER,
    })

    expect(route).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      apiKey: '',
    })
  })

  it('她这个月的 Runner 额度用完了：RUNNER_MONTHLY_LIMIT_EXCEEDED（429）', async () => {
    await db.generationJob.createMany({
      data: Array.from({ length: RUNNER_MONTHLY_LIMIT.PER_USER_LIMIT }, () => ({
        userId: me.id,
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        provider: 'runner',
        modelId: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
        status: 'COMPLETED' as const,
      })),
    })

    await expect(
      resolveGenerationRoute(me.id, {
        modelId: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
      }),
    ).rejects.toMatchObject({
      code: 'RUNNER_MONTHLY_LIMIT_EXCEEDED',
      status: 429,
    })
  })
})
