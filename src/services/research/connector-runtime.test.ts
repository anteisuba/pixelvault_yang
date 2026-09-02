import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockWarn = vi.fn()
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import {
  RESEARCH_SOURCE_IDS,
  RESEARCH_SOURCE_STATUSES,
  RESEARCH_UNAVAILABLE_REASONS,
} from '@/constants/research'
import {
  resetResearchBreakers,
  runConnector,
} from '@/services/research/connector-runtime'

beforeEach(() => {
  vi.clearAllMocks()
  resetResearchBreakers([RESEARCH_SOURCE_IDS.webSearch])
})

describe('runConnector — unavailable 是第三种终态，不是 empty', () => {
  it('maps a connector that declares itself unavailable onto its own receipt status', async () => {
    const { items, receipt } = await runConnector(
      RESEARCH_SOURCE_IDS.webSearch,
      async () => ({
        items: [],
        unavailable: RESEARCH_UNAVAILABLE_REASONS.missingKey,
      }),
    )

    expect(items).toEqual([])
    expect(receipt).toMatchObject({
      sourceId: RESEARCH_SOURCE_IDS.webSearch,
      status: RESEARCH_SOURCE_STATUSES.unavailable,
      reason: RESEARCH_UNAVAILABLE_REASONS.missingKey,
      count: 0,
    })
    // 大声记一笔，带上是哪个连接器
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('unavailable'),
      expect.objectContaining({ sourceId: RESEARCH_SOURCE_IDS.webSearch }),
    )
  })

  it('does not trip the circuit breaker — nothing was actually requested', async () => {
    for (let index = 0; index < 5; index += 1) {
      const { receipt } = await runConnector(
        RESEARCH_SOURCE_IDS.webSearch,
        async () => ({
          items: [],
          unavailable: RESEARCH_UNAVAILABLE_REASONS.missingKey,
        }),
      )
      expect(receipt.status).toBe(RESEARCH_SOURCE_STATUSES.unavailable)
    }
  })

  it('still reports empty when a configured connector simply found nothing', async () => {
    const { receipt } = await runConnector(
      RESEARCH_SOURCE_IDS.webSearch,
      async () => ({ items: [] }),
    )

    expect(receipt.status).toBe(RESEARCH_SOURCE_STATUSES.empty)
    expect(receipt.reason).toBeUndefined()
  })
})
