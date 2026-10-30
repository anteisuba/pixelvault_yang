import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CRON_HEARTBEAT, CRON_JOBS } from '@/constants/cron'

const mockSet = vi.fn()
const mockMget = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: class {
    set = (...args: unknown[]) => mockSet(...args)
    mget = (...args: unknown[]) => mockMget(...args)
  },
}))

const mockLoggerError = vi.fn()
vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { readCronHeartbeats, recordCronRun } from './cron-heartbeat'

const NOW = Date.parse('2026-08-25T12:00:00.000Z')

function configureUpstash() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  mockSet.mockResolvedValue('OK')
  mockMget.mockResolvedValue([null, null, null])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('recordCronRun', () => {
  it('writes a TTL-bounded heartbeat under the shared key prefix', async () => {
    configureUpstash()

    await recordCronRun(CRON_JOBS.EXECUTION_SWEEP, { ok: true })

    expect(mockSet).toHaveBeenCalledTimes(1)
    const [key, payload, options] = mockSet.mock.calls[0]
    expect(key).toBe(
      `${CRON_HEARTBEAT.KEY_PREFIX}:${CRON_JOBS.EXECUTION_SWEEP}`,
    )
    expect(payload).toMatchObject({ ok: true, detail: null })
    expect(typeof payload.finishedAt).toBe('string')
    expect(options).toEqual({ ex: CRON_HEARTBEAT.TTL_SECONDS })
  })

  it('carries the failure detail through', async () => {
    configureUpstash()

    await recordCronRun(CRON_JOBS.EXECUTION_SWEEP, {
      ok: false,
      detail: 'Sweep failed: database unreachable',
    })

    expect(mockSet.mock.calls[0][1]).toMatchObject({
      ok: false,
      detail: 'Sweep failed: database unreachable',
    })
  })

  it('is a no-op when Upstash is not configured', async () => {
    await recordCronRun(CRON_JOBS.EXECUTION_SWEEP, { ok: true })

    expect(mockSet).not.toHaveBeenCalled()
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  it('never throws when the write fails — the cron already did its work', async () => {
    configureUpstash()
    mockSet.mockRejectedValue(new Error('Upstash unreachable'))

    await expect(
      recordCronRun(CRON_JOBS.EXECUTION_SWEEP, { ok: true }),
    ).resolves.toBeUndefined()
    expect(mockLoggerError).toHaveBeenCalled()
  })
})

describe('readCronHeartbeats', () => {
  it('throws when Upstash is unconfigured instead of reporting all-clear', async () => {
    await expect(readCronHeartbeats(NOW)).rejects.toThrow(/not configured/i)
  })

  it('throws when the read fails — a blind monitor must not look healthy', async () => {
    configureUpstash()
    mockMget.mockRejectedValue(new Error('Upstash unreachable'))

    await expect(readCronHeartbeats(NOW)).rejects.toThrow('Upstash unreachable')
  })

  it('reports every configured cron, marking never-reported ones stale', async () => {
    configureUpstash()

    const entries = await readCronHeartbeats(NOW)

    expect(entries.map((entry) => entry.name)).toEqual([
      CRON_JOBS.EXECUTION_SWEEP,
    ])
    for (const entry of entries) {
      expect(entry.lastRun).toBeNull()
      expect(entry.ageMs).toBeNull()
      expect(entry.stale).toBe(true)
      expect(entry.healthy).toBe(false)
    }
  })

  it('treats a fresh successful run as healthy', async () => {
    configureUpstash()
    mockMget.mockResolvedValue([
      { ok: true, detail: null, finishedAt: '2026-08-25T00:30:00.000Z' },
    ])

    const [sweep] = await readCronHeartbeats(NOW)

    expect(sweep.healthy).toBe(true)
    expect(sweep.stale).toBe(false)
    expect(sweep.ageMs).toBe(11.5 * 60 * 60 * 1000)
  })

  it('accepts a JSON string as well as an object from the SDK', async () => {
    configureUpstash()
    mockMget.mockResolvedValue([
      JSON.stringify({
        ok: true,
        detail: null,
        finishedAt: '2026-08-25T00:30:00.000Z',
      }),
    ])

    const [sweep] = await readCronHeartbeats(NOW)

    expect(sweep.healthy).toBe(true)
  })

  it('flags a run that succeeded but is older than the max age', async () => {
    configureUpstash()
    // 25h — Hobby 的整点内漂移能造成的正常最大间隔，必须仍然算健康。
    const withinDrift = new Date(NOW - 25 * 60 * 60 * 1000).toISOString()
    // 27h — 已经漏掉一次运行。
    const missedOne = new Date(NOW - 27 * 60 * 60 * 1000).toISOString()
    mockMget.mockResolvedValue([
      { ok: true, detail: null, finishedAt: withinDrift },
    ])
    const [onTime] = await readCronHeartbeats(NOW)
    expect(onTime.stale).toBe(false)
    expect(onTime.healthy).toBe(true)

    mockMget.mockResolvedValue([
      { ok: true, detail: null, finishedAt: missedOne },
    ])
    const [late] = await readCronHeartbeats(NOW)
    expect(late.stale).toBe(true)
    expect(late.healthy).toBe(false)
  })

  it('flags a fresh run that reported failure', async () => {
    configureUpstash()
    mockMget.mockResolvedValue([
      {
        ok: false,
        detail: 'Sweep failed: database unreachable',
        finishedAt: '2026-08-25T04:10:00.000Z',
      },
    ])

    const [sweep] = await readCronHeartbeats(NOW)

    expect(sweep.stale).toBe(false)
    expect(sweep.healthy).toBe(false)
    expect(sweep.lastRun?.detail).toBe('Sweep failed: database unreachable')
  })

  it('treats a corrupted stored value as never-reported', async () => {
    configureUpstash()
    for (const corrupted of [{ ok: 'yes' }, 'not json at all']) {
      mockMget.mockResolvedValue([corrupted])

      const [entry] = await readCronHeartbeats(NOW)

      expect(entry.lastRun).toBeNull()
      expect(entry.stale).toBe(true)
    }
  })
})
