import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockWebSearch = vi.fn()
vi.mock('@/services/web-research.service', () => ({
  webSearch: (...args: unknown[]) => mockWebSearch(...args),
  readUrl: vi.fn(),
}))

import { RESEARCH_FRESHNESS } from '@/constants/research'
import { fetchWebSearchEvidence } from '@/services/research/web-search.connector'

function result(id: string) {
  return { title: id, url: `https://example.com/${id}`, snippet: `${id} body` }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchWebSearchEvidence', () => {
  /**
   * 🔬 owner 真机的根因之一：三条查询的结果首尾相接，而调用方只留前 8 条 ——
   * 第一条查询（作品名）回满 10 条就把名额吃光，后两条角色级查询一条都进不来，
   * 而回执上只写着 `web_search:ok · 8`。
   */
  it('⭐ 按名次交叉取：每条查询的第 1 名都排在任何一条查询的第 2 名之前', async () => {
    mockWebSearch.mockImplementation(async (query: string) =>
      [1, 2, 3].map((rank) => result(`${query}-${rank}`)),
    )

    const { items } = await fetchWebSearchEvidence({
      queries: ['work', 'character', 'character-ja'],
      freshness: RESEARCH_FRESHNESS.none,
    })

    expect(items.map((item) => item.title)).toEqual([
      'work-1',
      'character-1',
      'character-ja-1',
      'work-2',
      'character-2',
      'character-ja-2',
      'work-3',
      'character-3',
      'character-ja-3',
    ])
  })

  it('同一个 URL 只留一条（多条查询命中同一页是常态）', async () => {
    mockWebSearch.mockResolvedValue([result('same')])

    const { items } = await fetchWebSearchEvidence({
      queries: ['a', 'b'],
      freshness: RESEARCH_FRESHNESS.none,
    })
    expect(items).toHaveLength(1)
  })

  it('长短不一的批次不留空洞', async () => {
    mockWebSearch.mockImplementation(async (query: string) =>
      query === 'short'
        ? [result('short-1')]
        : [result('long-1'), result('long-2')],
    )

    const { items } = await fetchWebSearchEvidence({
      queries: ['short', 'long'],
      freshness: RESEARCH_FRESHNESS.none,
    })
    expect(items.map((item) => item.title)).toEqual([
      'short-1',
      'long-1',
      'long-2',
    ])
  })
})
