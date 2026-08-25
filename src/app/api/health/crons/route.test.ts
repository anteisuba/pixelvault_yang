import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CRON_JOBS } from '@/constants/cron'
import { parseJSON } from '@/test/api-helpers'

const mockRead = vi.fn()

vi.mock('@/lib/cron-heartbeat', () => ({
  readCronHeartbeats: (...args: unknown[]) => mockRead(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { GET } from './route'

const TOKEN = 'test-health-token'
const previousToken = process.env.HEALTH_CHECK_TOKEN

function request(token?: string): Request {
  return new Request('https://app.test/api/health/crons', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

function heartbeat(
  name: string,
  overrides: Partial<{ stale: boolean; healthy: boolean; detail: string }> = {},
) {
  const stale = overrides.stale ?? false
  const healthy = overrides.healthy ?? !stale
  return {
    name,
    lastRun: stale
      ? null
      : {
          ok: healthy,
          detail: overrides.detail ?? null,
          finishedAt: '2026-08-25T04:00:00.000Z',
        },
    ageMs: stale ? null : 3_600_000,
    stale,
    healthy,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HEALTH_CHECK_TOKEN = TOKEN
  mockRead.mockResolvedValue([
    heartbeat(CRON_JOBS.CIVITAI_LORA_PREWARM),
    heartbeat(CRON_JOBS.EXECUTION_SWEEP),
    heartbeat(CRON_JOBS.CIVITAI_MIRROR_SYNC),
  ])
})

afterEach(() => {
  process.env.HEALTH_CHECK_TOKEN = previousToken
})

describe('GET /api/health/crons', () => {
  it('returns 503 when HEALTH_CHECK_TOKEN is not configured', async () => {
    delete process.env.HEALTH_CHECK_TOKEN

    const res = await GET(request(TOKEN))

    expect(res.status).toBe(503)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 401 for a missing or wrong token', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request('wrong'))).status).toBe(401)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('reports healthy when all three crons checked in successfully', async () => {
    const res = await GET(request(TOKEN))
    const body = await parseJSON(res)

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      healthy: true,
      summary: { total: 3, healthy: 3, stale: 0, failed: 0 },
    })
  })

  it('stays 200 but reports unhealthy when a cron never checked in', async () => {
    // 200 是刻意的：判据在 healthy 字段上。非 200 专门留给「监控本身坏了」，
    // 这样 workflow 能把两种故障分开报。
    mockRead.mockResolvedValue([
      heartbeat(CRON_JOBS.CIVITAI_LORA_PREWARM),
      heartbeat(CRON_JOBS.EXECUTION_SWEEP, { stale: true }),
      heartbeat(CRON_JOBS.CIVITAI_MIRROR_SYNC),
    ])

    const res = await GET(request(TOKEN))
    const body = await parseJSON(res)

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      healthy: false,
      summary: { total: 3, healthy: 2, stale: 1, failed: 0 },
    })
  })

  it('counts a fresh-but-failed run separately from a stale one', async () => {
    mockRead.mockResolvedValue([
      heartbeat(CRON_JOBS.CIVITAI_LORA_PREWARM),
      heartbeat(CRON_JOBS.EXECUTION_SWEEP, { stale: true }),
      heartbeat(CRON_JOBS.CIVITAI_MIRROR_SYNC, {
        healthy: false,
        detail: 'Prune aborted: above the guard',
      }),
    ])

    const body = await parseJSON(await GET(request(TOKEN)))

    expect(body).toMatchObject({
      healthy: false,
      summary: { total: 3, healthy: 1, stale: 1, failed: 1 },
    })
  })

  it('returns 503 when the heartbeat store is unreachable', async () => {
    mockRead.mockRejectedValue(new Error('Upstash unreachable'))

    const res = await GET(request(TOKEN))
    const body = await parseJSON(res)

    expect(res.status).toBe(503)
    expect(body).toMatchObject({
      success: false,
      error: 'Upstash unreachable',
    })
  })
})
