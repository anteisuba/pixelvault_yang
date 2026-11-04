import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { RESEARCH_FRESHNESS } from '@/constants/research'
import { fetchWebSearchEvidence } from '@/services/research/web-search.connector'

/**
 * 只假网络：Serper 那一跳用 `fetch` 替身回，传输层（`webSearch`）走真代码。
 * 每条查询的回包由 `organicFor(q)` 决定。
 */
function stubSerper(organicFor: (q: string) => string[]) {
  const fetchFake = vi.fn(async (_url: string, init?: RequestInit) => {
    const { q } = JSON.parse(String(init?.body)) as { q: string }
    return Response.json({
      organic: organicFor(q).map((id) => ({
        title: id,
        link: `https://example.com/${id}`,
        snippet: `${id} body`,
      })),
    })
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

beforeEach(() => {
  vi.stubEnv('SERPER_API_KEY', 'serper-test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('fetchWebSearchEvidence', () => {
  /**
   * 🔬 owner 真机的根因之一：三条查询的结果首尾相接，而调用方只留前 8 条 ——
   * 第一条查询（作品名）回满 10 条就把名额吃光，后两条角色级查询一条都进不来，
   * 而回执上只写着 `web_search:ok · 8`。
   */
  it('⭐ 按名次交叉取：每条查询的第 1 名都排在任何一条查询的第 2 名之前', async () => {
    stubSerper((q) => [1, 2, 3].map((rank) => `${q}-${rank}`))

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
    stubSerper(() => ['same'])

    const { items } = await fetchWebSearchEvidence({
      queries: ['a', 'b'],
      freshness: RESEARCH_FRESHNESS.none,
    })
    expect(items).toHaveLength(1)
  })

  it('长短不一的批次不留空洞', async () => {
    stubSerper((q) => (q === 'short' ? ['short-1'] : ['long-1', 'long-2']))

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

  it('限定站点时查询词带上 site:，发出去的请求里看得到', async () => {
    const fetchFake = stubSerper(() => ['x'])

    await fetchWebSearchEvidence({
      queries: ['changli'],
      freshness: RESEARCH_FRESHNESS.none,
      includeDomains: ['wiki.example.com'],
    })
    const body = JSON.parse(String(fetchFake.mock.calls[0]?.[1]?.body))
    expect(body.q).toBe('changli site:wiki.example.com')
  })
})
