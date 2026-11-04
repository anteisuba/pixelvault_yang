/**
 * L2a 真库：模型配置那几条接口——管理端增删改查（/api/admin/models）、公开模型目录
 * （/api/models）、健康巡检（/api/models/health 管理员手动刷、/api/health/providers 令牌刷）。
 * 只假边界：Clerk 登录、服务商的 HEAD 探活（fetch）。服务与库全真，核库里的行与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const ADMIN_CLERK_ID = vi.hoisted(() => {
  const id = 'clerk_admin_models'
  process.env.ADMIN_USER_IDS = id
  return id
})

import {
  createDELETE,
  createGET,
  createPATCH,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { MODEL_OPTIONS } from '@/constants/models'
import {
  GET as LIST_CONFIGS,
  POST as CREATE_CONFIG,
} from '@/app/api/admin/models/route'
import {
  DELETE as DELETE_CONFIG,
  GET as GET_CONFIG,
  PATCH as PATCH_CONFIG,
} from '@/app/api/admin/models/[modelId]/route'
import { GET as LIST_MODELS } from '@/app/api/models/route'
import {
  GET as GET_HEALTH,
  POST as REFRESH_HEALTH,
} from '@/app/api/models/health/route'
import { POST as PROVIDERS_HEALTH } from '@/app/api/health/providers/route'
import { db } from '@/lib/db'
import { resetDatabase } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; error?: string }
type Config = { modelId: string; available: boolean; cost: number }
type HealthRecord = { modelId: string; status: string; error?: string }

const HF_BASE = 'https://hf.test/models'
const HEALTH_TOKEN = 'health-token-test'

const params = (modelId: string) => ({
  params: Promise.resolve({ modelId }),
})

function configBody(modelId: string, overrides: Record<string, unknown> = {}) {
  return {
    modelId,
    externalModelId: `org/${modelId}`,
    adapterType: 'huggingface',
    outputType: 'IMAGE',
    cost: 1,
    available: true,
    providerConfig: { label: 'HuggingFace', baseUrl: HF_BASE },
    sortOrder: 0,
    ...overrides,
  }
}

async function seedConfig(
  modelId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await CREATE_CONFIG(
    createPOST('/api/admin/models', configBody(modelId, overrides)),
  )
  expect(res.status).toBe(201)
}

/** 假服务商探活：路径里带 `down` 的模型回 503，其余 200。记下打过的地址。 */
const probed: string[] = []
function stubProviderProbe() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input)
      probed.push(url)
      return new Response(null, { status: url.includes('down') ? 503 : 200 })
    }),
  )
}

const previousHfToken = process.env.HF_API_TOKEN
const previousHealthToken = process.env.HEALTH_CHECK_TOKEN

beforeEach(async () => {
  probed.length = 0
  vi.unstubAllGlobals()
  stubProviderProbe()
  process.env.HF_API_TOKEN = 'hf-test-not-real'
  process.env.HEALTH_CHECK_TOKEN = HEALTH_TOKEN
  await resetDatabase()
  mockAuthenticated(ADMIN_CLERK_ID)
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const [key, value] of [
    ['HF_API_TOKEN', previousHfToken],
    ['HEALTH_CHECK_TOKEN', previousHealthToken],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('管理端模型配置（真库）', () => {
  it('没登录 / 不是管理员一律 403，不读不写', async () => {
    mockUnauthenticated()
    expect((await LIST_CONFIGS()).status).toBe(403)
    mockAuthenticated('clerk_not_admin')
    expect((await LIST_CONFIGS()).status).toBe(403)
    expect(
      (await CREATE_CONFIG(createPOST('/api/admin/models', configBody('m1'))))
        .status,
    ).toBe(403)
    expect(
      (
        await PATCH_CONFIG(
          createPATCH('/api/admin/models/m1', { available: false }),
          params('m1'),
        )
      ).status,
    ).toBe(403)
    expect(await db.modelConfig.count()).toBe(0)
  })

  it('建一条落库、列得出、按 id 读得到；缺字段 400 不落库', async () => {
    await seedConfig('test-sdxl')
    expect(
      await db.modelConfig.findUniqueOrThrow({
        where: { modelId: 'test-sdxl' },
      }),
    ).toMatchObject({
      externalModelId: 'org/test-sdxl',
      adapterType: 'huggingface',
      providerConfig: { label: 'HuggingFace', baseUrl: HF_BASE },
    })

    const bad = await CREATE_CONFIG(
      createPOST('/api/admin/models', { modelId: 'missing-fields' }),
    )
    expect(bad.status).toBe(400)
    expect(await db.modelConfig.count()).toBe(1)

    const list = await parseJSON<Envelope<Config[]>>(await LIST_CONFIGS())
    expect(list.data!.map((c) => c.modelId)).toEqual(['test-sdxl'])

    const one = await parseJSON<Envelope<Config>>(
      await GET_CONFIG(
        createGET('/api/admin/models/test-sdxl'),
        params('test-sdxl'),
      ),
    )
    expect(one.data).toMatchObject({ modelId: 'test-sdxl', available: true })
  })

  it('读不存在的 404', async () => {
    const res = await GET_CONFIG(
      createGET('/api/admin/models/nope'),
      params('nope'),
    )
    expect(res.status).toBe(404)
  })

  it('改：落库并回新值；负价 400 不改', async () => {
    await seedConfig('test-sdxl')

    const bad = await PATCH_CONFIG(
      createPATCH('/api/admin/models/test-sdxl', { cost: -1 }),
      params('test-sdxl'),
    )
    expect(bad.status).toBe(400)

    const res = await PATCH_CONFIG(
      createPATCH('/api/admin/models/test-sdxl', { available: false, cost: 3 }),
      params('test-sdxl'),
    )
    expect((await parseJSON<Envelope<Config>>(res)).data).toMatchObject({
      available: false,
      cost: 3,
    })
    expect(
      await db.modelConfig.findUniqueOrThrow({
        where: { modelId: 'test-sdxl' },
      }),
    ).toMatchObject({ available: false, cost: 3 })
  })

  it('删：行没了', async () => {
    await seedConfig('test-sdxl')
    const res = await DELETE_CONFIG(
      createDELETE('/api/admin/models/test-sdxl'),
      params('test-sdxl'),
    )
    expect(await parseJSON(res)).toEqual({ success: true })
    expect(await db.modelConfig.count()).toBe(0)
  })
})

describe('GET /api/models 公开目录（真库）', () => {
  it('库里的配置盖过内置：下架的不出现，库里新加的出现', async () => {
    const builtIn = MODEL_OPTIONS.find((m) => m.available !== false)!
    await seedConfig(builtIn.id, {
      adapterType: builtIn.adapterType,
      externalModelId: builtIn.externalModelId ?? 'x',
      outputType: builtIn.outputType,
      available: false,
    })
    await seedConfig('db-only-model')

    const body = await parseJSON<
      Envelope<Array<{ id: string; available: boolean }>>
    >(await LIST_MODELS())
    const ids = body.data!.map((m) => m.id)
    expect(ids).not.toContain(builtIn.id)
    expect(ids).toContain('db-only-model')
    expect(body.data!.every((m) => m.available)).toBe(true)
  })
})

describe('模型健康巡检（真库 + 假探活）', () => {
  it('还没巡检过：GET 回空列表', async () => {
    vi.resetModules()
    const fresh = await import('@/app/api/models/health/route')
    expect(await parseJSON(await fresh.GET())).toEqual({
      success: true,
      data: [],
    })
  })

  it('管理员刷新：只探上架的、可按 modelId 收窄；结果落库、GET 读到缓存', async () => {
    await seedConfig('alive-model')
    await seedConfig('down-model')
    await seedConfig('off-model', { available: false })

    const one = await parseJSON<Envelope<HealthRecord[]>>(
      await REFRESH_HEALTH(
        createPOST('/api/models/health', { modelId: 'alive-model' }),
      ),
    )
    expect(one.data).toEqual([
      expect.objectContaining({ modelId: 'alive-model', status: 'available' }),
    ])
    expect(probed).toEqual([`${HF_BASE}/org/alive-model`])

    const all = await parseJSON<Envelope<HealthRecord[]>>(
      await REFRESH_HEALTH(createPOST('/api/models/health', {})),
    )
    expect(
      Object.fromEntries(all.data!.map((r) => [r.modelId, r.status])),
    ).toEqual({ 'alive-model': 'available', 'down-model': 'unavailable' })

    const rows = await db.modelConfig.findMany({ orderBy: { modelId: 'asc' } })
    expect(rows.map((r) => [r.modelId, r.healthStatus])).toEqual([
      ['alive-model', 'available'],
      ['down-model', 'unavailable'],
      ['off-model', null],
    ])

    const cached = await parseJSON<Envelope<HealthRecord[]>>(await GET_HEALTH())
    expect(cached.data!.map((r) => r.modelId).sort()).toEqual([
      'alive-model',
      'down-model',
    ])
  })

  it('没有平台 key 的一家记 degraded，不去探', async () => {
    delete process.env.HF_API_TOKEN
    await seedConfig('alive-model')
    const body = await parseJSON<Envelope<HealthRecord[]>>(
      await REFRESH_HEALTH(createPOST('/api/models/health', {})),
    )
    expect(body.data).toEqual([
      expect.objectContaining({ modelId: 'alive-model', status: 'degraded' }),
    ])
    expect(probed).toEqual([])
  })

  it('刷新：非管理员 403、空 modelId 400，都不探', async () => {
    await seedConfig('alive-model')
    mockAuthenticated('clerk_not_admin')
    expect(
      (await REFRESH_HEALTH(createPOST('/api/models/health', {}))).status,
    ).toBe(403)
    mockAuthenticated(ADMIN_CLERK_ID)
    expect(
      (await REFRESH_HEALTH(createPOST('/api/models/health', { modelId: '' })))
        .status,
    ).toBe(400)
    expect(probed).toEqual([])
  })

  describe('POST /api/health/providers（令牌）', () => {
    const request = (token?: string) =>
      new Request('http://localhost:3000/api/health/providers', {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      })

    it('没配令牌 503；令牌不对 401；都不探', async () => {
      await seedConfig('alive-model')
      delete process.env.HEALTH_CHECK_TOKEN
      expect((await PROVIDERS_HEALTH(request(HEALTH_TOKEN))).status).toBe(503)
      process.env.HEALTH_CHECK_TOKEN = HEALTH_TOKEN
      expect((await PROVIDERS_HEALTH(request('wrong'))).status).toBe(401)
      expect((await PROVIDERS_HEALTH(request())).status).toBe(401)
      expect(probed).toEqual([])
    })

    it('探所有上架的，回分档汇总', async () => {
      await seedConfig('alive-model')
      await seedConfig('down-model')
      await seedConfig('off-model', { available: false })

      const body = await parseJSON<
        Envelope<HealthRecord[]> & { summary: Record<string, number> }
      >(await PROVIDERS_HEALTH(request(HEALTH_TOKEN)))
      expect(body.summary).toEqual({
        total: 2,
        available: 1,
        degraded: 0,
        unavailable: 1,
      })
      expect(probed.sort()).toEqual([
        `${HF_BASE}/org/alive-model`,
        `${HF_BASE}/org/down-model`,
      ])
    })
  })
})
