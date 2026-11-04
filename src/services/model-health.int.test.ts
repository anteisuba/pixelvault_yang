/**
 * L2a 真库：模型健康检查（model-health.service）。真 adapter、真平台 key 读取（测试里设假值）、
 * 真库里的 ModelConfig；只假 provider 网络（fetch）。核结果、发出去的探测请求、库里的健康状态与缓存。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  checkAllModelsHealth,
  checkSingleModelHealth,
  getHealthCache,
} from '@/services/model-health.service'
import { resetDatabase } from '@/test/int/db'

const FAL = 'https://fal.test'
const probe = vi.hoisted(() => ({
  status: 200,
  fail: null as string | null,
  requests: [] as Array<{ url: string; method?: string; auth: string | null }>,
}))

beforeEach(async () => {
  await resetDatabase()
  probe.status = 200
  probe.fail = null
  probe.requests = []
  vi.stubEnv('FAL_API_KEY', 'test-platform-fal-key')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      probe.requests.push({
        url,
        method: init?.method,
        auth: new Headers(init?.headers).get('Authorization'),
      })
      if (probe.fail) throw new Error(probe.fail)
      return new Response(null, { status: probe.status })
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const target = (modelId = 'flux-2-pro') => ({
  modelId,
  externalModelId: 'fal-ai/flux-pro/v1.1',
  adapterType: AI_ADAPTER_TYPES.FAL,
  baseUrl: FAL,
})

describe('checkSingleModelHealth（真 adapter，假网络）', () => {
  it('用平台 key 探测模型地址；通了算 available', async () => {
    const result = await checkSingleModelHealth(target())
    expect(result).toMatchObject({ modelId: 'flux-2-pro', status: 'available' })
    expect(probe.requests).toEqual([
      {
        url: `${FAL}/fal-ai/flux-pro/v1.1`,
        method: 'HEAD',
        auth: 'Key test-platform-fal-key',
      },
    ])
  })

  it('探测失败算 unavailable，带上原因', async () => {
    probe.status = 503
    expect(await checkSingleModelHealth(target())).toMatchObject({
      status: 'unavailable',
      error: 'HTTP 503',
    })
  })

  it('没有健康检查的 adapter、没配平台 key：degraded，不发请求', async () => {
    expect(
      await checkSingleModelHealth({
        ...target(),
        adapterType: AI_ADAPTER_TYPES.RUNNER,
      }),
    ).toMatchObject({ status: 'degraded' })

    vi.stubEnv('FAL_API_KEY', undefined)
    expect(await checkSingleModelHealth(target())).toMatchObject({
      status: 'degraded',
      error: `No system API key for ${AI_ADAPTER_TYPES.FAL}`,
    })
    expect(probe.requests).toHaveLength(0)
  })
})

describe('checkAllModelsHealth（真库）', () => {
  it('结果写回库里的 ModelConfig，并进缓存', async () => {
    await db.modelConfig.create({
      data: {
        modelId: 'flux-2-pro',
        externalModelId: 'fal-ai/flux-pro/v1.1',
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: {},
      },
    })
    probe.fail = 'Timeout'

    const records = await checkAllModelsHealth([target()])
    expect(records).toMatchObject([
      { modelId: 'flux-2-pro', status: 'unavailable', error: 'Timeout' },
    ])
    const row = await db.modelConfig.findUniqueOrThrow({
      where: { modelId: 'flux-2-pro' },
    })
    expect(row.healthStatus).toBe('unavailable')
    expect(row.lastHealthCheck).not.toBeNull()
    expect(getHealthCache()).toEqual({ records, stale: false })
  })
})
