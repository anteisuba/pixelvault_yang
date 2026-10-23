import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// 退避链本身在 with-retry 自己的测试里覆盖；这里验的是连接器的降级逻辑。
vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import {
  FANDOM_WIKIS,
  MEDIAWIKI_READ_HOSTS,
  MEDIAWIKI_SITES,
  RESEARCH_SOURCE_IDS,
} from '@/constants/research'
import {
  fetchMediaWikiEvidence,
  getMediaWikiSite,
  isRelevantToTerms,
  readMediaWikiPage,
  researchTermsOf,
  resolveFandomSite,
  resolveMediaWikiReadTarget,
  resolveMediaWikiSite,
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
/** ⚠ Fandom 的 host 按作品现解析（A4），⛔ 不再是能力表里的一行。 */
const FANDOM = resolveFandomSite(['鸣潮'])!

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
  it('knows every site in the capability table', () => {
    for (const site of MEDIAWIKI_SITES) {
      expect(getMediaWikiSite(site.sourceId)).toBe(site)
    }
    // ⛔ wiki.gg 不进首版（本机出口整站 401 + 页面 403 Cloudflare 挑战）
    expect(MEDIAWIKI_SITES.some((site) => site.api.includes('wiki.gg'))).toBe(
      false,
    )
    // ⛔ Fandom 不许再出现在定址表里 —— 它的 host 按作品解析。
    expect(
      MEDIAWIKI_SITES.some(
        (site) => site.sourceId === RESEARCH_SOURCE_IDS.fandom,
      ),
    ).toBe(false)
  })
})

describe('A4 · Fandom 按实体解析子站', () => {
  it('⭐ 中英日别名都能命中同一个 wiki（无限大 / Ananta）', () => {
    expect(resolveFandomSite(['无限大'])?.api).toContain('ananta.fandom.com')
    expect(resolveFandomSite(['Ananta', '时夜'])?.api).toContain(
      'ananta.fandom.com',
    )
    expect(resolveFandomSite(['原神', '钟离'])?.api).toContain(
      'genshin-impact.fandom.com',
    )
  })

  it('⛔ 表里没有的作品返回 null，⛔ 不退回鸣潮（那正是旧 bug）', () => {
    expect(resolveFandomSite(['某部没人写过的作品'])).toBeNull()
    expect(resolveFandomSite([])).toBeNull()
  })

  it('resolveMediaWikiSite：定址站走能力表，Fandom 走解析', () => {
    expect(
      resolveMediaWikiSite(RESEARCH_SOURCE_IDS.moegirl, ['原神'])?.api,
    ).toContain('moegirl')
    expect(
      resolveMediaWikiSite(RESEARCH_SOURCE_IDS.fandom, ['原神'])?.api,
    ).toContain('genshin-impact')
    expect(resolveMediaWikiSite(RESEARCH_SOURCE_IDS.fandom, ['x'])).toBeNull()
  })

  it('每个子域拼出的 api / pageUrlPrefix 同源', () => {
    for (const wiki of FANDOM_WIKIS) {
      const site = resolveFandomSite([wiki.aliases[0]!])!
      expect(site.api).toBe(`https://${wiki.subdomain}.fandom.com/api.php`)
      expect(site.pageUrlPrefix).toBe(
        `https://${wiki.subdomain}.fandom.com/wiki/`,
      )
    }
  })
})

describe('A2 · 相关性闸（搜到了但搜到的不是它）', () => {
  it('实体词至少两个字符，⛔ 单字不做判据', () => {
    expect(researchTermsOf('外貌', ['无限大', '时夜', '时'])).toEqual([
      '无限大',
      '时夜',
    ])
    // 没有实体时按空白切目标。
    expect(researchTermsOf('无限大 时夜')).toEqual(['无限大', '时夜'])
  })

  it('⭐ 页名与实体无重叠 → 不相关（《时之歌》≠「时夜」）', () => {
    const terms = researchTermsOf('', ['无限大', '时夜'])
    expect(isRelevantToTerms({ terms, title: '时之歌' })).toBe(false)
    expect(isRelevantToTerms({ terms, title: '夜王' })).toBe(false)
    expect(isRelevantToTerms({ terms, title: '鸣潮' })).toBe(false)
  })

  it('页名命中、或导语里出现实体 → 相关', () => {
    const terms = researchTermsOf('', ['无限大', '时夜'])
    expect(isRelevantToTerms({ terms, title: '时夜' })).toBe(true)
    expect(isRelevantToTerms({ terms, title: '时夜（无限大）' })).toBe(true)
    expect(
      isRelevantToTerms({
        terms,
        title: 'Shiye',
        lead: '时夜是《无限大》的登场角色。',
      }),
    ).toBe(true)
    // 简繁一位容差：「鸣潮」↔「鳴潮」。
    expect(isRelevantToTerms({ terms: ['鸣潮'], title: '鳴潮' })).toBe(true)
  })

  it('⚠ 没有可用实体词时不判 —— 宁可放行也不拿空判据删证据', () => {
    expect(isRelevantToTerms({ terms: [], title: '随便什么' })).toBe(true)
  })

  it('⭐ 不相关的页一个字都不交出去：items 空 + unrelated 说明', async () => {
    routeFetch([
      {
        match: 'action=opensearch',
        body: ['时夜', ['时之歌'], [''], ['https://zh.moegirl.org.cn/时之歌']],
      },
      {
        match: 'prop=extracts',
        body: {
          query: {
            pages: [
              {
                pageid: 1,
                title: '时之歌',
                extract: '《时之歌》是一个日本音乐企划。'.repeat(4),
              },
            ],
          },
        },
      },
    ])

    const result = await fetchMediaWikiEvidence({
      site: MOEGIRL,
      query: '无限大 时夜',
      entities: ['无限大', '时夜'],
    })

    expect(result.items).toEqual([])
    expect(result.unrelated).toContain('时之歌')
  })

  it('相关的页照常出证据（同一条路，只是名字对上了）', async () => {
    routeFetch([
      {
        match: 'action=opensearch',
        body: ['时夜', ['时夜'], [''], ['https://zh.moegirl.org.cn/时夜']],
      },
      {
        match: 'prop=extracts',
        body: {
          query: {
            pages: [
              {
                pageid: 2,
                title: '时夜',
                extract: '时夜是《无限大》的登场角色。'.repeat(4),
              },
            ],
          },
        },
      },
    ])

    const result = await fetchMediaWikiEvidence({
      site: MOEGIRL,
      query: '无限大 时夜',
      entities: ['无限大', '时夜'],
    })

    expect(result.unrelated).toBeUndefined()
    expect(result.items.length).toBeGreaterThan(0)
  })
})

/**
 * ⭐ **按网址读一页 wiki**（`read_url` 的退路 (a)，2026-10-15）：认得出是哪个站、哪一页，就照
 *   表（`MEDIAWIKI_READ_HOSTS`）打它的 API；认不出的一律 `null`（交给下一条退路）。
 */
describe('resolveMediaWikiReadTarget：网址 → 哪个 wiki 的哪一页', () => {
  it.each([
    [
      '灰机wiki（子域）',
      'https://ff14.huijiwiki.com/wiki/%E5%85%89%E4%B9%8B%E6%88%98%E5%A3%AB',
      '光之战士',
      'https://ff14.huijiwiki.com/api.php',
      'https://ff14.huijiwiki.com/wiki/',
    ],
    [
      'B站 wiki（游戏段在路径里）',
      'https://wiki.biligame.com/ys/%E5%88%BB%E6%99%B4',
      '刻晴',
      'https://wiki.biligame.com/ys/api.php',
      'https://wiki.biligame.com/ys/',
    ],
    [
      'B站 wiki 的 index.php?title=',
      'https://wiki.biligame.com/ys/index.php?title=%E5%88%BB%E6%99%B4&action=view',
      '刻晴',
      'https://wiki.biligame.com/ys/api.php',
      'https://wiki.biligame.com/ys/',
    ],
    [
      'Fandom 语言段',
      'https://genshin-impact.fandom.com/zh/wiki/Keqing',
      'Keqing',
      'https://genshin-impact.fandom.com/zh/api.php',
      'https://genshin-impact.fandom.com/zh/wiki/',
    ],
    [
      'Fandom 英文（下划线 = 空格，锚点不算页名）',
      'https://wutheringwaves.fandom.com/wiki/Chang_Li#Appearance',
      'Chang Li',
      'https://wutheringwaves.fandom.com/api.php',
      'https://wutheringwaves.fandom.com/wiki/',
    ],
    [
      '萌百繁简路径',
      'https://zh.moegirl.org.cn/zh-hans/%E9%95%BF%E7%A6%BB',
      '长离',
      'https://zh.moegirl.org.cn/api.php',
      'https://zh.moegirl.org.cn/',
    ],
    [
      '中文维基 /zh-cn/',
      'https://zh.wikipedia.org/zh-cn/%E9%B3%B4%E6%BD%AE',
      '鳴潮',
      'https://zh.wikipedia.org/w/api.php',
      'https://zh.wikipedia.org/wiki/',
    ],
  ])('⭐ %s', (_name, url, title, api, pageUrlPrefix) => {
    const target = resolveMediaWikiReadTarget(url)
    expect(target?.title).toBe(title)
    expect(target?.site).toMatchObject({
      sourceId: RESEARCH_SOURCE_IDS.urlReader,
      api,
      pageUrlPrefix,
      // 按网址读一页：⛔ 不搜、不取分类与主图。
      supportsOpenSearch: false,
      supportsGeneratorSearch: false,
      supportsCategories: false,
      supportsPageImages: false,
    })
  })

  it('⛔ 不是表里的站、特殊页、首页 / 没页名的一律 null', () => {
    for (const url of [
      'https://www.example.test/wiki/Keqing',
      'https://notwikipedia.org/wiki/X',
      'https://zh.wikipedia.org/wiki/Special:Search',
      'https://zh.moegirl.org.cn/',
      'https://zh.moegirl.org.cn/index.php',
      'https://wiki.biligame.com/',
      'https://zh.wikipedia.org/w/index.php',
      'not a url',
    ])
      expect(resolveMediaWikiReadTarget(url)).toBeNull()
  })

  it('表里每一行都认得出自己的一页（数据驱动：加一行就是加一个站）', () => {
    for (const host of MEDIAWIKI_READ_HOSTS) {
      const origin = `https://${host.match === 'suffix' ? `sub.${host.host}` : host.host}`
      const path = `${host.wikiInPath ? '/game' : ''}${host.titlePrefix}Page`
      const target = resolveMediaWikiReadTarget(`${origin}${path}`)
      expect(target?.title, host.label).toBe('Page')
      expect(target?.site.contentRoutes, host.label).toEqual(host.contentRoutes)
    }
  })
})

describe('readMediaWikiPage：按 API 读那一页', () => {
  it('⭐ 走表里的降级链（灰机wiki：extracts 拒了就换 revisions），回页名、正文、页地址', async () => {
    const target = resolveMediaWikiReadTarget(
      'https://ff14.huijiwiki.com/wiki/Page',
    )!
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('prop=extracts'))
        return jsonResponse({ error: { code: 'unknown_prop' } })
      if (url.includes('prop=revisions'))
        return jsonResponse({
          query: {
            pages: [
              {
                title: 'Page',
                revisions: [
                  {
                    slots: { main: { content: "'''光之战士'''是[[主角]]。" } },
                  },
                ],
              },
            ],
          },
        })
      throw new Error(`unexpected fetch: ${url}`)
    })

    const page = await readMediaWikiPage(target)
    expect(page).toEqual({
      title: 'Page',
      text: '光之战士是主角。',
      url: 'https://ff14.huijiwiki.com/wiki/Page',
    })
    expect(
      fetchedUrls().every((url) =>
        url.startsWith('https://ff14.huijiwiki.com/api.php?'),
      ),
    ).toBe(true)
  })

  it('页不存在 = null（⛔ 不是抛错）；整条链都拒 = 抛（调用方换下一条退路）', async () => {
    const target = resolveMediaWikiReadTarget('https://zh.moegirl.org.cn/Nope')!
    routeFetch([
      {
        match: 'prop=extracts',
        body: { query: { pages: [{ title: 'Nope', missing: true }] } },
      },
    ])
    await expect(readMediaWikiPage(target)).resolves.toBeNull()

    routeFetch([
      {
        match: 'prop=extracts',
        body: { error: { code: 'action-notallowed' } },
      },
    ])
    await expect(readMediaWikiPage(target)).rejects.toThrow('action-notallowed')
  })
})
