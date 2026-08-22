import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN } from '@/constants/lora'

const mockSync = vi.fn()

vi.mock('@/services/civitai-mirror-sync.service', () => ({
  syncCivitaiMirrorChunk: (...args: unknown[]) => mockSync(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { GET } from '@/app/api/internal/civitai-mirror/sync/route'

// ⚠ 这份夹具是手写的镜像，mock 无类型，漏字段 TS 抓不到——加字段时必须同步，
// 否则新字段在路由边界上零覆盖（同类漂移见 VideoComposer 的测试夹具）。
const CHUNK = {
  scanned: 500,
  upserted: 500,
  skipped: 0,
  cursor: 500,
  completed: false,
  pruned: 0,
  notice: null,
}

function request(url: string, token?: string): Request {
  return new Request(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  mockSync.mockResolvedValue(CHUNK)
})

describe('GET /api/internal/civitai-mirror/sync', () => {
  it('refuses to run when no cron secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const response = await GET(
      request('https://x/api/internal/civitai-mirror/sync'),
    )

    expect(response.status).toBe(503)
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    vi.stubEnv('CRON_SECRET', 'right')

    const response = await GET(
      request('https://x/api/internal/civitai-mirror/sync', 'wrong'),
    )

    expect(response.status).toBe(401)
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('advances a chunk with the default batch budget', async () => {
    vi.stubEnv('CRON_SECRET', 'right')

    const response = await GET(
      request('https://x/api/internal/civitai-mirror/sync', 'right'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: CHUNK,
    })
    expect(mockSync).toHaveBeenCalledWith({
      maxBatches: CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN,
    })
  })

  it('caps a caller-supplied batch count at the per-run ceiling', async () => {
    // 上限是为了不撞函数执行时长；调用方给多大都不能越过它。
    vi.stubEnv('CRON_SECRET', 'right')

    await GET(
      request(
        'https://x/api/internal/civitai-mirror/sync?batches=9999',
        'right',
      ),
    )

    expect(mockSync).toHaveBeenCalledWith({
      maxBatches: CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN,
    })
  })

  it.each([
    // 小数会让循环上界变成非整数语义的值，两条路径分别收口
    ['?batches=1.9', 1], // >= 1 的小数：Math.floor 向下取整
    ['?batches=0.5', CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN], // < 1：落回默认
    ['?batches=-3', CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN],
    ['?batches=abc', CIVITAI_MIRROR_SYNC_MAX_BATCHES_PER_RUN],
  ])('coerces %s to an integer batch count', async (query, expected) => {
    vi.stubEnv('CRON_SECRET', 'right')

    await GET(
      request(`https://x/api/internal/civitai-mirror/sync${query}`, 'right'),
    )

    expect(mockSync).toHaveBeenCalledWith({ maxBatches: expected })
  })

  it('surfaces a sync failure as 502 rather than pretending it worked', async () => {
    vi.stubEnv('CRON_SECRET', 'right')
    mockSync.mockRejectedValue(new Error('upstream down'))

    const response = await GET(
      request('https://x/api/internal/civitai-mirror/sync', 'right'),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'upstream down',
    })
  })
})
