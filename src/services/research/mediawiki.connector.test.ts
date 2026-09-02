import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// 退避链本身在 with-retry 自己的测试里覆盖；这里验的是连接器的降级逻辑。
vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import { MEDIAWIKI_SITES, RESEARCH_SOURCE_IDS } from '@/constants/research'
import {
  fetchMediaWikiEvidence,
  getMediaWikiSite,
  pickQueryForSite,
} from '@/services/research/mediawiki.connector'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** 按 URL 里的关键片段路由 mock 响应 —— 断言的是「打了哪些模块」。 */
function routeFetch(routes: { match: string; body: unknown }[]): void {
  mockFetch.mockImplementation(async (url: string) => {
    const hit = routes.find((route) => url.includes(route.match))
    if (!hit) throw new Error(`unexpected fetch: ${url}`)
    return jsonResponse(hit.body)
  })
}

function fetchedUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]))
}

const MOEGIRL = MEDIAWIKI_SITES.find(
  (site) => site.sourceId === RESEARCH_SOURCE_IDS.moegirl,
)!
// Fandom 没有固定 host —— 站点由规划器按 IP 给出，测试里指定一个。
const FANDOM = getMediaWikiSite(RESEARCH_SOURCE_IDS.fandom, {
  fandomHost: 'wutheringwaves.fandom.com',
})!

describe('fetchMediaWikiEvidence — 萌娘百科', () => {
  it('turns categories into structured tag evidence and pageimages into image evidence', async () => {
    routeFetch([
      {
        match: 'action=opensearch',
        body: ['长离', ['长离'], [''], ['https://zh.moegirl.org.cn/长离']],
      },
      {
        match: 'prop=extracts',
        body: {
          query: {
            pages: [
              {
                pageid: 606764,
                title: '长离',
                extract: '长离是库洛制作的游戏《鸣潮》的登场角色。'.repeat(4),
                categories: [
                  { title: 'Category:粉发' },
                  { title: 'Category:金瞳' },
                  { title: 'Category:下双马尾' },
                ],
                original: {
                  source: 'https://storage.moegirl.org.cn/长离.png',
                  width: 1139,
                  height: 1654,
                },
              },
            ],
          },
        },
      },
    ])

    const result = await fetchMediaWikiEvidence({
      site: MOEGIRL,
      query: '长离',
    })

    const kinds = result.items.map((item) => item.kind)
    expect(kinds).toEqual(['text', 'tags', 'image'])

    const tags = result.items.find((item) => item.kind === 'tags')
    // 🔬 切片 0 两臂都答错的「长离发色」，这一条直接给对 —— 而且是分类名直出，
    //    不需要再过一次 LLM 提取（少一次提取就少一处幻觉面）。
    expect(tags).toMatchObject({
      tags: ['粉发', '金瞳', '下双马尾'],
      sourceId: RESEARCH_SOURCE_IDS.moegirl,
      sourceTier: 'community',
    })
    expect(tags?.title).toContain('长离')

    const image = result.items.find((item) => item.kind === 'image')
    expect(image).toMatchObject({ width: 1139, height: 1654 })

    // 每条证据都带抓取时刻 —— §3.4 第 4 闸「新鲜度」全链的那一环
    for (const item of result.items) {
      expect(Date.parse(item.retrievedAt)).not.toBeNaN()
    }
  })

  it('never uses list=search — the standard spelling moegirl blocks', async () => {
    routeFetch([
      { match: 'action=opensearch', body: ['长离', ['长离'], [''], ['']] },
      {
        match: 'prop=extracts',
        body: { query: { pages: [{ title: '长离', extract: '正文' }] } },
      },
    ])

    await fetchMediaWikiEvidence({ site: MOEGIRL, query: '长离' })

    const urls = fetchedUrls()
    expect(urls.some((url) => url.includes('list%3Dsearch'))).toBe(false)
    expect(urls.some((url) => url.includes('list=search'))).toBe(false)
  })

  it('treats HTTP 200 + error.code as a source failure, not as an empty result', async () => {
    // ⚠ 这是 §3.4 第 1 闸的核心判据：MediaWiki 的「拒绝」是 200 + body 里的
    //    error.code。只看状态码会把「被封了」（failed）当成「没搜到」
    //    （no_evidence），而这两件事该给用户的下一步完全不同。
    routeFetch([
      {
        match: 'action=opensearch',
        body: {
          error: { code: 'action-notallowed', info: 'Unauthorized API call' },
        },
      },
    ])

    await expect(
      fetchMediaWikiEvidence({ site: MOEGIRL, query: '长离' }),
    ).rejects.toThrow(/action-notallowed/)
  })

  it('returns no items (not an error) when the wiki simply has no such page', async () => {
    routeFetch([{ match: 'action=opensearch', body: ['无此页', [], [], []] }])
    mockFetch.mockImplementationOnce(async () =>
      jsonResponse(['无此页', [], [], []]),
    )
    mockFetch.mockImplementationOnce(async () =>
      jsonResponse({ query: { pages: [] } }),
    )

    const result = await fetchMediaWikiEvidence({
      site: MOEGIRL,
      query: '无此页',
    })
    expect(result.items).toHaveLength(0)
  })
})

describe('fetchMediaWikiEvidence — Fandom（能力层不同构）', () => {
  it('takes the wikitext route because Fandom has no TextExtracts', async () => {
    routeFetch([
      {
        match: 'action=opensearch',
        body: ['Changli', ['Changli'], [''], ['']],
      },
      {
        match: 'prop=revisions',
        body: {
          query: {
            pages: [
              {
                title: 'Changli',
                revisions: [
                  {
                    slots: {
                      main: {
                        content:
                          "'''Changli''' is a [[Wuthering Waves|WuWa]] character.<ref>x</ref>\n[[File:Changli.png]]",
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    ])

    const result = await fetchMediaWikiEvidence({
      site: FANDOM,
      query: 'Changli',
    })

    expect(fetchedUrls().some((url) => url.includes('prop=extracts'))).toBe(
      false,
    )
    const text = result.items.find((item) => item.kind === 'text')
    expect(text?.excerpt).toContain('Changli is a WuWa character.')
    // 去标记要把 File 链接和 ref 拿掉，否则证据里全是模板噪声
    expect(text?.excerpt).not.toContain('[[File:')
    expect(text?.excerpt).not.toContain('<ref>')
    // Fandom 没有 categories / pageimages 能力，不该凭空造出这两类证据
    expect(result.items.map((item) => item.kind)).toEqual(['text'])
  })

  it('falls through to action=parse when revisions comes back blocked', async () => {
    routeFetch([
      {
        match: 'action=opensearch',
        body: ['Changli', ['Changli'], [''], ['']],
      },
      {
        match: 'prop=revisions',
        body: { error: { code: 'action-notallowed' } },
      },
      {
        match: 'action=parse',
        body: {
          parse: { title: 'Changli', wikitext: 'Changli is a character.' },
        },
      },
    ])

    const result = await fetchMediaWikiEvidence({
      site: FANDOM,
      query: 'Changli',
    })

    expect(result.items[0]?.kind).toBe('text')
    expect(fetchedUrls().some((url) => url.includes('action=parse'))).toBe(true)
  })
})

describe('per-site query selection', () => {
  it('feeds each site the query in its own language', () => {
    const queries = [
      { text: '长离 鸣潮', lang: 'zh' as const },
      { text: 'changli wuthering waves', lang: 'en' as const },
    ]

    expect(pickQueryForSite(MOEGIRL, queries)).toBe('长离 鸣潮')
    expect(pickQueryForSite(FANDOM, queries)).toBe('changli wuthering waves')
  })

  it('builds the Fandom site from the planner host and refuses to guess one', () => {
    // 2026-09-01 附录 B 缺口 ③：原先写死 wutheringwaves.fandom.com，问「无限大」
    // 也去鸣潮站查 —— 猜站不诚实，没有站就跳过。
    expect(getMediaWikiSite(RESEARCH_SOURCE_IDS.fandom)).toBeUndefined()
    expect(
      MEDIAWIKI_SITES.some(
        (site) => site.sourceId === RESEARCH_SOURCE_IDS.fandom,
      ),
    ).toBe(false)

    const ananta = getMediaWikiSite(RESEARCH_SOURCE_IDS.fandom, {
      fandomHost: 'ananta.fandom.com',
    })
    expect(ananta?.api).toBe('https://ananta.fandom.com/api.php')
    expect(ananta?.pageUrlPrefix).toBe('https://ananta.fandom.com/wiki/')
    expect(ananta?.queryLanguage).toBe('en')
    // 能力表（wikitext 路、无 TextExtracts）不随 host 变
    expect(ananta?.contentRoutes).toEqual(FANDOM.contentRoutes)
  })

  it('knows every site in the capability table', () => {
    for (const site of MEDIAWIKI_SITES) {
      expect(getMediaWikiSite(site.sourceId)).toBe(site)
    }
    // ⛔ wiki.gg 不进首版（本机出口整站 401 + 页面 403 Cloudflare 挑战）
    expect(MEDIAWIKI_SITES.some((site) => site.api.includes('wiki.gg'))).toBe(
      false,
    )
  })
})
