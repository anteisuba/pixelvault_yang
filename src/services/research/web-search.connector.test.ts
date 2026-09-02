import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockWebSearch = vi.fn()
const mockIsConfigured = vi.fn()
vi.mock('@/services/web-research.service', () => ({
  webSearch: (...args: unknown[]) => mockWebSearch(...args),
  readUrl: vi.fn(),
  isWebSearchConfigured: () => mockIsConfigured(),
}))

import {
  RESEARCH_FRESHNESS,
  RESEARCH_UNAVAILABLE_REASONS,
} from '@/constants/research'
import { fetchWebSearchEvidence } from '@/services/research/web-search.connector'

beforeEach(() => {
  vi.clearAllMocks()
  mockIsConfigured.mockReturnValue(true)
  mockWebSearch.mockResolvedValue([])
})

describe('fetchWebSearchEvidence — 缺 key（2026-09-01 附录 B 缺口 ②）', () => {
  it('reports unavailable:missingKey without touching Serper — never a silent empty', async () => {
    mockIsConfigured.mockReturnValue(false)

    const result = await fetchWebSearchEvidence({
      queries: ['无限大'],
      freshness: RESEARCH_FRESHNESS.none,
    })

    expect(result.items).toEqual([])
    expect(result.unavailable).toBe(RESEARCH_UNAVAILABLE_REASONS.missingKey)
    expect(mockWebSearch).not.toHaveBeenCalled()
  })

  it('turns Serper organic results into web_search evidence when configured', async () => {
    mockWebSearch.mockResolvedValue([
      {
        title: '无限大 - 萌娘百科',
        url: 'https://zh.moegirl.org.cn/无限大',
        snippet: '网易 Naked Rain 工作室开发',
        date: '2026-01-15',
      },
    ])

    const result = await fetchWebSearchEvidence({
      queries: ['无限大', '我想要无限大的资料'],
      freshness: RESEARCH_FRESHNESS.week,
    })

    expect(result.unavailable).toBeUndefined()
    expect(mockWebSearch).toHaveBeenCalledTimes(2)
    expect(mockWebSearch).toHaveBeenCalledWith('无限大', { tbs: 'qdr:w' })
    // 同一 URL 两条查询都命中 → 只留一条
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      kind: 'text',
      sourceId: 'web_search',
      url: 'https://zh.moegirl.org.cn/无限大',
    })
  })
})
