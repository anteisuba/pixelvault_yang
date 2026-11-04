/**
 * 助手检索扇出（2026-09-06）。真连接器、真并发、真归并；只假网络：
 * Serper / 萌百 / 中文维基 / Fandom / Danbooru / B站 都在 `fetch` 上按主机名回包。
 * ⚠ 一个真请求都不发 —— Serper credit 是真钱，萌百 / danbooru 是别人的服务器。
 * 断言的是「打了哪几个源、发了什么查询、证据怎么归并排序、回执怎么写」。
 * 真库（L2a）：danbooru 那一支会去词库（`DanbooruTagName`）补中日文名。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  RESEARCH_SOURCE_IDS,
  type ResearchSourceId,
} from '@/constants/research'
import { markReadHostBlocked, resetReadHostBlocks } from '@/lib/read-url-blocks'
import type { EvidenceItem } from '@/types/research'
import { resetResearchBreakers } from '@/services/research/connector-runtime'
import { resetDanbooruCatalogCache } from '@/services/research/danbooru.connector'
import {
  buildResearchQueryPlan,
  confidenceOfCredibility,
  countCorroboration,
  runAssistantResearch,
  summarizeResearchConclusion,
  scopeOfEvidence,
  toAssistantEvidence,
} from '@/services/research/research-fanout.service'
import { resetDatabase } from '@/test/int/db'
import {
  danbooruResponse,
  emptyDanbooruWorld,
  type DanbooruWorld,
} from '@/test/int/fake-research-web'

// ─── 假的外网 ─────────────────────────────────────────────────────

interface WikiPage {
  title: string
  extract: string
  categories?: string[]
}

interface SerperHit {
  title: string
  link: string
  snippet?: string
}

const web = {
  serper: (() => []) as (query: string) => SerperHit[],
  /** 主机名 → 按搜索词 / 页名给页（`null` = 没有）。 */
  wiki: {} as Record<string, (search: string) => WikiPage | null>,
  danbooru: null as unknown as DanbooruWorld,
  /** 发出去的每个请求（完整 URL）。 */
  requests: [] as string[],
  /** Serper 收到的每条查询（`q`）。 */
  serperQueries: [] as string[],
}

function hostsHit(): string[] {
  return [...new Set(web.requests.map((url) => new URL(url).host))]
}

function param(url: string, name: string): string | null {
  return new URL(url).searchParams.get(name)
}

function wikiResponse(host: string, url: string): unknown {
  const pageOf = web.wiki[host] ?? (() => null)
  const action = param(url, 'action')
  if (action === 'opensearch') {
    const search = param(url, 'search') ?? ''
    const page = pageOf(search)
    return [search, page ? [page.title] : [], [], []]
  }
  const titles = param(url, 'titles')
  if (action === 'query' && titles) {
    const page = pageOf(titles)
    return {
      query: {
        pages: page
          ? [
              {
                title: page.title,
                extract: page.extract,
                categories: (page.categories ?? []).map((name) => ({
                  title: `Category:${name}`,
                })),
              },
            ]
          : [],
      },
    }
  }
  return {}
}

async function fakeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  web.requests.push(url)
  const { host } = new URL(url)
  if (host === 'google.serper.dev') {
    const { q } = JSON.parse(String(init?.body ?? '{}')) as { q: string }
    web.serperQueries.push(q)
    return Response.json({ organic: web.serper(q) })
  }
  if (
    host.endsWith('moegirl.org.cn') ||
    host.endsWith('wikipedia.org') ||
    host.endsWith('fandom.com')
  )
    return Response.json(wikiResponse(host, url))
  if (host === 'danbooru.donmai.us') return danbooruResponse(web.danbooru, url)
  if (host.endsWith('bilibili.com')) return Response.json({ data: {} })
  throw new Error(`unexpected fetch ${url}`)
}

const MOEGIRL = 'zh.moegirl.org.cn'
const ZHWIKI = 'zh.wikipedia.org'
/** 萌百那一页的地址（连接器按页名拼）。 */
const moegirlUrl = (title: string) =>
  `https://${MOEGIRL}/${encodeURIComponent(title)}`

/** 搜的词 / 页名里带着 `key` 就给这一页。 */
function pageWhen(key: string, page: WikiPage) {
  return (search: string) => (search.includes(key) ? page : null)
}

const SHIYE: WikiPage = {
  title: '时夜',
  extract: '时夜是游戏《无限大》的登场角色。黑色长发，金色瞳孔。',
  categories: ['黑发', '金瞳'],
}

const ALL_SOURCES = Object.values(RESEARCH_SOURCE_IDS) as ResearchSourceId[]

beforeEach(async () => {
  await resetDatabase()
  resetResearchBreakers(ALL_SOURCES)
  resetDanbooruCatalogCache()
  resetReadHostBlocks()
  web.serper = () => []
  web.wiki = {}
  web.danbooru = emptyDanbooruWorld()
  web.requests = []
  web.serperQueries = []
  vi.stubEnv('SERPER_API_KEY', 'serper-test-key')
  vi.stubGlobal('fetch', fakeFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function receiptOf(
  outcome: Awaited<ReturnType<typeof runAssistantResearch>>,
  sourceId: ResearchSourceId,
) {
  return outcome.receipts.find((receipt) => receipt.sourceId === sourceId)
}

/** Danbooru 收到的别名反查（`other_names_match`）。 */
function danbooruLookups(): string[] {
  return web.requests
    .filter((url) => url.includes('danbooru.donmai.us/wiki_pages.json'))
    .map((url) => param(url, 'search[other_names_match]'))
    .filter((value): value is string => value !== null)
}

/** 萌百收到的页名搜索（opensearch 的 `search`）。 */
function moegirlSearches(): string[] {
  return web.requests
    .filter(
      (url) =>
        new URL(url).host === MOEGIRL && param(url, 'action') === 'opensearch',
    )
    .map((url) => param(url, 'search') ?? '')
}

const RETRIEVED_AT = '2026-09-06T00:00:00.000Z'

function textItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    kind: 'text',
    id: 'moegirl:时夜',
    sourceId: RESEARCH_SOURCE_IDS.moegirl,
    sourceTier: 'community',
    retrievedAt: RETRIEVED_AT,
    title: '萌娘百科 · 时夜',
    url: 'https://zh.moegirl.org.cn/shiye',
    excerpt: '黑色长发，金色瞳孔。',
    ...overrides,
  } as EvidenceItem
}

describe('buildResearchQueryPlan（A3：查询表不截角色名）', () => {
  it('⭐ 有角色名时三条**全是角色级**，⛔ 不再单发一条只有作品名的查询', () => {
    const plan = buildResearchQueryPlan('外貌 服饰', ['无限大', '时夜'])
    /**
     * 🔬 2026-09-07 实测：裸的「无限大 时夜」首屏仍是游戏本身，而加了中文/日文
     * 限定词的那两条才带回官网角色页与外貌描述。所以三条都带角色名。
     */
    expect(plan.queries).toEqual([
      '无限大 时夜',
      '无限大 时夜 角色 设定',
      '无限大 时夜 キャラクター',
    ])
    expect(plan.queries.every((query) => query.includes('时夜'))).toBe(true)
    expect(plan.character).toBe('时夜')
    expect(plan.work).toBe('无限大')
  })

  it('⭐ 日文那条优先用别名 —— 日文圈用的是原名（Ananta）', () => {
    const plan = buildResearchQueryPlan('外貌', ['无限大', 'Ananta', '时夜'])
    expect(plan.queries[2]).toBe('Ananta 时夜 キャラクター')
  })

  it('⭐ wiki 腿吃的是「作品 + 角色」，⛔ 不再是 queries.at(-1)', () => {
    // 三个以上实体时，`at(-1)` 会漂到中间那个别名上 —— 这正是真机里查错的那一跳。
    const plan = buildResearchQueryPlan('角色设定', [
      '无限大',
      'Ananta',
      '时夜',
    ])
    expect(plan.wikiQuery).toBe('无限大 时夜')
    // 🔬 旧实现取 `queries.at(-1)`，而旧查询表被截断后最后一条正是别名 Ananta。
    expect(plan.wikiQuery).not.toBe('Ananta')
    expect(plan.entities).toEqual(['无限大', 'Ananta', '时夜'])
  })

  it('没有实体时只发目标本身，⛔ 不编一个实体出来', () => {
    const plan = buildResearchQueryPlan('ananta official site', [])
    expect(plan.queries).toEqual(['ananta official site'])
    expect(plan.wikiQuery).toBe('ananta official site')
  })

  it('空白实体被丢掉；单实体时 wiki 腿就查它（⛔ 没有角色名就不铺角色级查询）', () => {
    const plan = buildResearchQueryPlan('goal', ['  ', 'x'])
    expect(plan.queries).toEqual(['x', 'x goal', 'goal'])
    expect(plan.wikiQuery).toBe('x')
    expect(plan.character).toBeUndefined()
  })
})

describe('confidenceOfCredibility', () => {
  it('官方 → high · 官方转载/资料 → medium · 玩家整理 → low', () => {
    expect(confidenceOfCredibility('official')).toBe('high')
    expect(confidenceOfCredibility('officialMirror')).toBe('medium')
    expect(confidenceOfCredibility('reference')).toBe('medium')
    expect(confidenceOfCredibility('communityDigest')).toBe('low')
  })
})

describe('scopeOfEvidence（A5：作品级 ≠ 角色级）', () => {
  it('⭐ 只讲作品的条目判 work —— 🔬 owner 那 10 条全是这一档', () => {
    const item = textItem({
      sourceId: RESEARCH_SOURCE_IDS.webSearch,
      title: '无限大(游戏) - 维基百科',
      url: 'https://zh.wikipedia.org/wiki/无限大',
      excerpt: '《无限大》是一款由 Naked Rain 工作室开发的开放世界游戏。',
    } as Partial<EvidenceItem>)
    expect(scopeOfEvidence(item, '时夜')).toBe('work')
  })

  it('角色名出现在摘要里就判 character（官网首页的台词那条正是这样）', () => {
    const item = textItem({
      excerpt: '队长. 我不堵车。 · 时夜. 我负责出钱， 你负责出力。',
    })
    expect(scopeOfEvidence(item, '时夜')).toBe('character')
  })

  it('⛔ 没给角色名时不判 —— 不拿空判据去标签所有证据', () => {
    expect(scopeOfEvidence(textItem(), undefined)).toBe('unknown')
  })
})

describe('toAssistantEvidence', () => {
  it('出处取域名；⛔ 不留空', () => {
    expect(toAssistantEvidence(textItem()).publisher).toBe('zh.moegirl.org.cn')
  })

  it('没有 url 的那些回落成源名（danbooru 的共现标签就是这种）', () => {
    const evidence = toAssistantEvidence(
      textItem({
        kind: 'tags',
        sourceId: RESEARCH_SOURCE_IDS.danbooru,
        title: 'danbooru tags',
        url: undefined,
        tags: ['black_hair', 'yellow_eyes'],
        provenance: '100 张样本共现',
      } as Partial<EvidenceItem>),
    )
    expect(evidence.publisher).toBe('danbooru')
    expect(evidence.url).toBeUndefined()
    expect(evidence.kind).toBe('tags')
    // 标签档摘要**就是那串标签** —— 提示词直接吃得下的词。
    expect(evidence.snippet).toContain('black_hair')
  })

  it('⛔ 图片档的摘要里没有图片直链（那条路只走候选网格 + 用户点选）', () => {
    const evidence = toAssistantEvidence(
      textItem({
        kind: 'image',
        imageUrl: 'https://cdn.example.com/secret.png',
        url: 'https://zh.moegirl.org.cn/shiye',
        width: 800,
        height: 1200,
      } as Partial<EvidenceItem>),
    )
    expect(evidence.snippet).not.toContain('secret.png')
    expect(evidence.snippet).toContain('800×1200')
  })
})

describe('runAssistantResearch', () => {
  it('默认打 wiki + 网搜 + danbooru，⛔ 默认不打 B站', async () => {
    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['鸣潮', '今州'],
    })

    // ⚠ 三个 wiki 源都发出去了（Fandom 这一轮解析得出子站）。
    expect(hostsHit()).toEqual(
      expect.arrayContaining([
        MOEGIRL,
        ZHWIKI,
        'wutheringwaves.fandom.com',
        'google.serper.dev',
        'danbooru.donmai.us',
      ]),
    )
    expect(hostsHit().some((host) => host.endsWith('bilibili.com'))).toBe(false)
    expect(receiptOf(outcome, RESEARCH_SOURCE_IDS.bilibili)).toBeUndefined()
  })

  it('模型指定 sources 时只打那几组', async () => {
    await runAssistantResearch({ goal: '外貌', sources: ['web'] })
    expect(hostsHit()).toEqual(['google.serper.dev'])
  })

  it('⭐ A1：缺 SERPER_API_KEY 只把 web_search 标 skipped，百科腿照跑', async () => {
    vi.stubEnv('SERPER_API_KEY', '')
    web.wiki[MOEGIRL] = pageWhen('时夜', SHIYE)

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['无限大', '时夜'],
    })

    // ⛔ 一把 Serper 钥匙不许锁上免 key 的那几扇门。
    expect(web.serperQueries).toEqual([])
    expect(hostsHit()).toEqual(
      expect.arrayContaining([MOEGIRL, 'danbooru.donmai.us']),
    )
    expect(outcome.evidence.length).toBeGreaterThan(0)

    const webReceipt = receiptOf(outcome, RESEARCH_SOURCE_IDS.webSearch)
    expect(webReceipt?.status).toBe('skipped')
    expect(webReceipt?.error).toBe('missing SERPER_API_KEY')
  })

  it('⭐ A3：wiki 腿吃「作品 + 角色」，网搜吃整张查询表', async () => {
    await runAssistantResearch({
      goal: '外貌 服饰',
      entities: ['无限大', 'Ananta', '时夜'],
      sources: ['wiki', 'web'],
    })

    expect([...web.serperQueries].sort()).toEqual(
      [
        '无限大 时夜',
        '无限大 时夜 角色 设定',
        'Ananta 时夜 キャラクター',
      ].sort(),
    )
    // ⛔ 不再是 `queries.at(-1)` 漂到的那个别名。
    expect(moegirlSearches()).toEqual(['无限大 时夜'])
  })

  it('⭐ A4：Fandom 按实体解析子站 —— 原神走 genshin-impact，⛔ 不再恒返鸣潮', async () => {
    await runAssistantResearch({
      goal: '角色设定',
      entities: ['原神', '钟离'],
      sources: ['wiki'],
    })

    const fandomHosts = hostsHit().filter((host) => host.endsWith('fandom.com'))
    expect(fandomHosts).toEqual(['genshin-impact.fandom.com'])
  })

  it('⭐ A4：表里没有的作品 → skipped: no fandom site，⛔ 不退回任何子域', async () => {
    const outcome = await runAssistantResearch({
      goal: '角色设定',
      entities: ['某部没人写过的作品', '某角色'],
      sources: ['wiki'],
    })

    const fandom = receiptOf(outcome, RESEARCH_SOURCE_IDS.fandom)
    expect(fandom?.status).toBe('skipped')
    expect(fandom?.error).toBe('no fandom site')
    expect(hostsHit().some((host) => host.endsWith('fandom.com'))).toBe(false)
  })

  it('⭐ A2：搜到的页不是它 → 回执 unrelated（⛔ 不折进 empty），一条证据都不交', async () => {
    // 模糊搜索永远有第一条：萌百把《时之歌》当第一条回来。
    web.wiki[MOEGIRL] = () => ({
      title: '时之歌',
      extract: '时之歌是一首歌曲。',
    })

    const outcome = await runAssistantResearch({
      goal: '角色设定',
      entities: ['无限大', '时夜'],
      sources: ['wiki'],
    })

    const moegirl = receiptOf(outcome, RESEARCH_SOURCE_IDS.moegirl)
    // 「搜到了但不是它」与「没料」下一步该做的事不同：前者换名字重查。
    expect(moegirl?.status).toBe('unrelated')
    expect(moegirl?.error).toContain('时之歌')
    expect(outcome.evidence).toEqual([])
  })

  it('⭐ 单源失败不拖垮整体：回执如实说 failed，其余源照常出证据', async () => {
    web.danbooru.down = true
    web.wiki[MOEGIRL] = pageWhen('时夜', SHIYE)

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['时夜'],
    })

    expect(outcome.evidence.length).toBeGreaterThan(0)
    // ⚠ 「源挂了」≠「没料」—— 两句话下一步该做的事完全不同。
    expect(receiptOf(outcome, RESEARCH_SOURCE_IDS.danbooru)?.status).toBe(
      'failed',
    )
  })

  it('同一个页面被两个源命中时只留权威档那条', async () => {
    web.wiki[MOEGIRL] = pageWhen('时夜', SHIYE)
    web.serper = () => [
      { title: 'Google 的那条', link: moegirlUrl('时夜'), snippet: '黑发' },
    ]

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['时夜'],
      sources: ['wiki', 'web'],
    })

    const sameUrl = outcome.evidence.filter(
      (item) => item.url === moegirlUrl('时夜'),
    )
    // 萌百那一页（正文 + 分类标签两条）留着，网搜那条同址的被并掉。
    expect(sameUrl.map((item) => item.title)).toContain('萌娘百科 · 时夜')
    expect(sameUrl.map((item) => item.title)).not.toContain('Google 的那条')
  })

  it('尊重 limit', async () => {
    web.wiki[MOEGIRL] = pageWhen('时夜', SHIYE)
    web.wiki[ZHWIKI] = pageWhen('时夜', SHIYE)

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['时夜'],
      sources: ['wiki'],
      limit: 1,
    })
    expect(outcome.evidence).toHaveLength(1)
  })
})

/**
 * **题型排序偏置**（2026-09-12）。🔬 实测：查「新海诚式黄昏光怎么描述」，
 * 维基与百度百科的同一段**生平**互相印证排到第一，唯一一条讲逆光与云层的技法文
 * 被挤到后面截掉。
 */
describe('runAssistantResearch · 题型排序（2026-09-12）', () => {
  const BIO: SerperHit = {
    title: '新海诚 - 维基百科：生平',
    link: 'https://zh.wikipedia.org/wiki/新海诚',
    snippet: '新海诚，日本动画导演，1973 年出生于长野县。',
  }
  const CRAFT: SerperHit = {
    title: '新海诚光影技法解析：逆光与云层',
    link: 'https://example.com/shinkai-lighting',
    snippet: '他的黄昏用高饱和的橙紫渐变与强逆光。',
  }

  it('⭐ style_technique：技法页排到生平条目前面', async () => {
    web.serper = () => [BIO, CRAFT]
    const outcome = await runAssistantResearch({
      goal: '黄昏光怎么描述',
      sources: ['web'],
      questionType: 'style_technique',
    })
    expect(outcome.evidence[0]?.title).toBe(CRAFT.title)
  })

  it('⚠ 不给题型（或别的题型）时排序**逐字与改动前一致**', async () => {
    web.serper = () => [BIO, CRAFT]
    const typed = await runAssistantResearch({
      goal: '新海诚是谁',
      sources: ['web'],
      questionType: 'entity_facts',
    })
    expect(typed.evidence[0]?.title).toBe(BIO.title)

    const untyped = await runAssistantResearch({
      goal: '新海诚是谁',
      sources: ['web'],
    })
    expect(untyped.evidence[0]?.title).toBe(BIO.title)
  })

  it('⛔ 题型不许越过印证数：3 源印证的生平仍排在单源技法文之前', async () => {
    // 同名 = 同一事实（`factKeyOf` 判标题），三个不同域名 = 3 源印证。
    web.serper = () => [
      BIO,
      { ...BIO, link: 'https://baike.baidu.com/新海诚' },
      { ...BIO, link: 'https://www.sohu.com/a/1' },
      CRAFT,
    ]
    const outcome = await runAssistantResearch({
      goal: '黄昏光怎么描述',
      sources: ['web'],
      questionType: 'style_technique',
    })
    expect(outcome.evidence[0]?.title).toBe(BIO.title)
    expect(outcome.evidence[0]?.corroboration).toBe(3)
  })
})

/**
 * **最近挡过读者的站排后面**（2026-10-15）：同印证、同题型分时才起作用，⛔ 不删、不越过前两道次序。
 */
describe('runAssistantResearch · 挡过读者的站往后放（2026-10-15）', () => {
  const OPEN: SerperHit = {
    title: '时夜 - 设定集',
    link: 'https://open.example.test/a',
    snippet: '黑色长发。',
  }
  const WALLED: SerperHit = {
    title: '时夜 - 攻略站',
    link: 'https://walled.example.test/a',
    snippet: '金色瞳孔。',
  }

  it('⭐ 同印证数时，挡过读者的站排到读得到的后面；它的摘要照样留着', async () => {
    markReadHostBlocked('walled.example.test', {
      reason: 'challenge',
      detail: 'just a moment...',
      readerOnly: false,
    })
    web.serper = () => [WALLED, OPEN]
    const outcome = await runAssistantResearch({
      goal: '外貌',
      sources: ['web'],
    })
    expect(outcome.evidence.map((item) => item.title)).toEqual([
      OPEN.title,
      WALLED.title,
    ])
  })

  it('只挡了 Jina（退路读得到）的不算，顺序不动', async () => {
    markReadHostBlocked('walled.example.test', {
      reason: 'status',
      detail: 'HTTP 403',
      readerOnly: true,
    })
    web.serper = () => [WALLED, OPEN]
    const outcome = await runAssistantResearch({
      goal: '外貌',
      sources: ['web'],
    })
    expect(outcome.evidence[0]?.title).toBe(WALLED.title)
  })
})

describe('runAssistantResearch · 角色级（2026-09-07）', () => {
  it('⭐ danbooru 查的是**角色名**（作品名只拿来核共现），⛔ 不再是 queries[0]', async () => {
    await runAssistantResearch({
      goal: '外貌 服饰',
      entities: ['无限大', 'Ananta', '时夜'],
      sources: ['danbooru'],
    })
    // 🔬 旧实现喂「无限大 时夜」整条，回来的是 game tag 的全作品统计（别人的兔耳朵）。
    expect(danbooruLookups()).toEqual(['时夜', '无限大'])
  })

  it('没有角色名时 danbooru 照旧查作品本身（那时问的就是作品）', async () => {
    await runAssistantResearch({
      goal: '这游戏是什么',
      entities: ['无限大'],
      sources: ['danbooru'],
    })
    expect(danbooruLookups()).toEqual(['无限大'])
  })

  it('⭐ 官方域出 official/high，未知域回落玩家整理/low', async () => {
    web.serper = (query) =>
      query === '无限大 时夜'
        ? [
            {
              title: '无限大 - 网易',
              link: 'https://ananta.163.com/m/',
              snippet: '时夜. 我负责出钱，你负责出力。',
            },
            {
              title: '某人的整理',
              link: 'https://mugendai-matome.com/260/',
              snippet: '主人公の幼馴染。',
            },
          ]
        : []

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['无限大', '时夜'],
      sources: ['web'],
    })

    // 🔬 打回的那一轮里 `ananta.163.com` 与个人整理页都显示「资料」。
    expect(outcome.evidence[0]).toMatchObject({
      credibility: 'official',
      confidence: 'high',
      scope: 'character',
    })
    expect(outcome.evidence[1]).toMatchObject({
      credibility: 'communityDigest',
      confidence: 'low',
      scope: 'work',
    })
  })

  it('⭐ danbooru 的证据钉死角色级 —— 它的字面是英文 tag，判不出中文名', async () => {
    web.danbooru.aliases = { 时夜: 'shiye_(ananta)', 无限大: 'ananta' }
    web.danbooru.categories = { 'shiye_(ananta)': 4, ananta: 3 }
    web.danbooru.together = ['shiye_(ananta) ananta']
    web.danbooru.posts = {
      'shiye_(ananta)': ['black_hair red_streaks', 'black_hair'],
    }

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['无限大', '时夜'],
      sources: ['danbooru'],
    })
    expect(outcome.evidence.length).toBeGreaterThan(0)
    expect(outcome.evidence.every((item) => item.scope === 'character')).toBe(
      true,
    )
    expect(JSON.stringify(outcome.evidence)).toContain('black_hair')
  })
})

/**
 * ⭐ **并发印证**（assistant-shell-v2 §9.1 ③ / §9.2，commit #16）——
 * 「几个源说了同一件事」由服务端算，印证多的排前，单源如实打标。
 */
describe('印证与结论（§9，commit #16）', () => {
  it('⭐ 同一事实两个域名说过 = 2 源印证；同一个站说两遍仍是单源', () => {
    const counts = countCorroboration([
      textItem(),
      textItem({
        id: 'zhwiki:时夜',
        sourceId: RESEARCH_SOURCE_IDS.wikipediaZh,
        url: 'https://zh.wikipedia.org/wiki/shiye',
      }),
      // 同一个域名的第二页 —— 一个站自己说两遍⛔ 不算印证。
      textItem({
        id: 'moegirl:时夜2',
        title: '独家：另一件事',
        url: 'https://zh.moegirl.org.cn/other',
      }),
    ])
    // ⚠ 键去掉了「萌娘百科 · 」这类**源前缀**：它是连接器加的装饰，不是标题。
    expect(counts.get('时夜')).toBe(2)
    expect(counts.get('独家另一件事')).toBe(1)
  })

  it('⭐ 印证多的排前，且每条都带 corroboration（⛔ 不由模型写）', async () => {
    // 萌百、中文维基都有「时夜」（两个域名 = 2 源印证）；网页那条只有一个人这么说。
    web.wiki[MOEGIRL] = pageWhen('时夜', SHIYE)
    web.wiki[ZHWIKI] = pageWhen('时夜', SHIYE)
    web.serper = () => [
      {
        title: '只有一个人这么说',
        link: 'https://a.test/x',
        snippet: '时夜喜欢甜食。',
      },
    ]

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['无限大', '时夜'],
      sources: ['wiki', 'web'],
    })

    expect(outcome.evidence[0]?.corroboration).toBe(2)
    expect(outcome.evidence.at(-1)?.corroboration).toBe(1)
    expect(outcome.evidence.at(-1)?.title).toBe('只有一个人这么说')
  })

  it('⭐ 结论取印证最多、层级最高的那一条；一条可读的都没有就缺席', () => {
    const conclusion = summarizeResearchConclusion([
      {
        title: '个人博客',
        publisher: 'blog.test',
        snippet: '我猜是黑发。',
        kind: 'text',
        confidence: 'low',
        credibility: 'communityDigest',
        scope: 'character',
        corroboration: 1,
        cite: 1,
      },
      {
        title: '官方设定集',
        publisher: 'official.test',
        snippet: '黑色长发，金色瞳孔。',
        kind: 'text',
        confidence: 'high',
        credibility: 'official',
        scope: 'character',
        corroboration: 3,
        cite: 2,
      },
    ])
    expect(conclusion).toBe('黑色长发，金色瞳孔。')

    // ⚠ 标签串与图片占位不是一句可以读的话 —— ⛔ 不拿它们当结论。
    expect(
      summarizeResearchConclusion([
        {
          title: 'danbooru',
          publisher: 'danbooru.donmai.us',
          snippet: 'black_hair, yellow_eyes',
          kind: 'tags',
          confidence: 'medium',
          credibility: 'reference',
          scope: 'character',
          corroboration: 2,
          cite: 1,
        },
      ]),
    ).toBeUndefined()
  })

  it('⭐ 改写那一步给了查询就顶掉确定性那几条，wiki 腿照旧吃页名', async () => {
    await runAssistantResearch({
      goal: '外貌',
      entities: ['无限大', '时夜'],
      queries: ['无限大 时夜 设定', 'Ananta Shiye design'],
    })

    expect([...web.serperQueries].sort()).toEqual(
      ['无限大 时夜 设定', 'Ananta Shiye design'].sort(),
    )
    // wiki 吃的仍然是「作品 + 角色」那条页名，⛔ 不是改写出来的长查询。
    expect(moegirlSearches()).toEqual(['无限大 时夜'])
  })
})

describe('runAssistantResearch · 所选模型自带联网（owner 2026-09-30）', () => {
  it('⭐ 网页那一源交给模型自带联网：不打 Serper，回执标出是哪一家', async () => {
    const outcome = await runAssistantResearch({
      goal: '卡提希娅 配色',
      sources: ['web'],
      nativeWebSearch: async () => ({
        status: 'searched',
        queries: ['native actual query'],
        sources: [
          {
            url: 'https://a.test/page',
            title: 'A 站',
            excerpt: '青绿配色',
            excerptKind: 'answer_fragment',
          },
        ],
        via: 'gemini',
      }),
    })

    expect(web.serperQueries).toEqual([])
    expect(outcome.items).toHaveLength(1)
    expect(outcome.items[0]).toMatchObject({
      sourceId: RESEARCH_SOURCE_IDS.webSearch,
      url: 'https://a.test/page',
      title: 'A 站',
      excerptKind: 'answer_fragment',
    })
    expect(outcome.evidence[0]?.excerptKind).toBe('answer_fragment')
    expect(outcome.queries).toEqual(['native actual query'])
    expect(outcome.receipts).toContainEqual(
      expect.objectContaining({
        sourceId: RESEARCH_SOURCE_IDS.webSearch,
        status: 'ok',
        via: 'gemini',
        queries: ['native actual query'],
      }),
    )
  })

  it('⚠ 模型那边挂了、又没配 Serper：只记这一源失败，⛔ 不抛', async () => {
    vi.stubEnv('SERPER_API_KEY', '')
    const outcome = await runAssistantResearch({
      goal: '卡提希娅 配色',
      sources: ['web'],
      nativeWebSearch: async () => {
        throw new Error('upstream 503')
      },
    })
    expect(outcome.items).toEqual([])
    expect(outcome.receipts).toContainEqual(
      expect.objectContaining({ status: 'failed', error: 'upstream 503' }),
    )
  })

  it.each([
    [
      'failed',
      async () => {
        throw new Error('upstream 400')
      },
      'native search failed: upstream 400',
    ],
    [
      'not_invoked',
      async () => ({
        status: 'not_invoked' as const,
        queries: [],
        sources: [],
        via: 'deepseek',
      }),
      'native deepseek skipped: native_search_not_invoked',
    ],
  ] as const)(
    '⭐ 自带联网%s：回落 Serper，回执写清从哪儿退下来的（2026-10-14）',
    async (_status, nativeWebSearch, error) => {
      web.serper = () => [
        {
          title: 'Serper 那一条',
          link: 'https://serper.test/page',
          snippet: '配色',
        },
      ]
      const outcome = await runAssistantResearch({
        goal: '卡提希娅 配色',
        sources: ['web'],
        nativeWebSearch,
      })
      expect(web.serperQueries.length).toBeGreaterThan(0)
      expect(outcome.items.map((item) => item.url)).toEqual([
        'https://serper.test/page',
      ])
      expect(outcome.receipts).toContainEqual(
        expect.objectContaining({
          sourceId: RESEARCH_SOURCE_IDS.webSearch,
          status: 'ok',
          via: 'serper-fallback',
          error,
        }),
      )
    },
  )

  it.each([
    ['empty', 'empty', 0, undefined],
    ['not_invoked', 'skipped', 0, 'native_search_not_invoked'],
    ['failed', 'failed', 0, 'unavailable'],
    ['paused', 'failed', 1, 'native_search_paused'],
    ['partial', 'failed', 1, 'max_uses_exceeded'],
  ] as const)(
    '原生%s回执不被证据条数改成成功',
    async (status, receiptStatus, count, error) => {
      // 没配 Serper：看的是自带联网自己的回执（配了时 failed / not_invoked 会回落）。
      vi.stubEnv('SERPER_API_KEY', '')
      const outcome = await runAssistantResearch({
        goal: '配色',
        sources: ['web'],
        nativeWebSearch: async () => ({
          status,
          queries: status === 'not_invoked' ? [] : ['native actual query'],
          sources:
            status === 'empty'
              ? []
              : [
                  {
                    url: 'https://a.test/page',
                    title: 'A',
                    excerpt: '青绿',
                    excerptKind: 'source_excerpt',
                  },
                ],
          via: 'anthropic',
          ...(error ? { error } : {}),
        }),
      })
      expect(outcome.items).toHaveLength(count)
      expect(outcome.receipts).toContainEqual(
        expect.objectContaining({
          sourceId: RESEARCH_SOURCE_IDS.webSearch,
          status: receiptStatus,
          count,
          via: 'anthropic',
          ...(error ? { error } : {}),
        }),
      )
      expect(web.serperQueries).toEqual([])
    },
  )
})
