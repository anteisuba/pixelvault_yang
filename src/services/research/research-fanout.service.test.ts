import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * 助手检索扇出（2026-09-06）。
 *
 * ⚠ **连接器全程 mock，一个真请求都不发** —— Serper credit 是真钱，萌百 /
 * danbooru 是别人的服务器。这一层要验的是「打哪几个源、怎么归并、怎么投影」，
 * 不是上游返回什么。
 */
const mockFetchWebSearchEvidence = vi.fn()
const mockFetchMediaWikiEvidence = vi.fn()
const mockFetchDanbooruEvidence = vi.fn()
const mockFetchBilibiliEvidence = vi.fn()

vi.mock('@/services/research/web-search.connector', () => ({
  fetchWebSearchEvidence: (...args: unknown[]) =>
    mockFetchWebSearchEvidence(...args),
}))
/**
 * ⚠ **只 mock 取证据那一跳**：`resolveFandomSite` / `getMediaWikiSite` 是**纯的
 * 站点解析**（本轮 A4 的判据全在它们身上），mock 掉就等于把要验的东西验没了。
 */
vi.mock('@/services/research/mediawiki.connector', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/research/mediawiki.connector')
  >('@/services/research/mediawiki.connector')
  return {
    ...actual,
    fetchMediaWikiEvidence: (...args: unknown[]) =>
      mockFetchMediaWikiEvidence(...args),
  }
})

/** Serper 是否配了 —— 本轮 A1 的判据，逐条测两支。 */
const mockIsWebSearchConfigured = vi.fn()
vi.mock('@/services/web-research.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/web-research.service')
  >('@/services/web-research.service')
  return { ...actual, isWebSearchConfigured: () => mockIsWebSearchConfigured() }
})
vi.mock('@/services/research/danbooru.connector', () => ({
  fetchDanbooruEvidence: (...args: unknown[]) =>
    mockFetchDanbooruEvidence(...args),
}))
vi.mock('@/services/research/bilibili.connector', () => ({
  fetchBilibiliEvidence: (...args: unknown[]) =>
    mockFetchBilibiliEvidence(...args),
}))

import { MEDIAWIKI_SOURCE_IDS, RESEARCH_SOURCE_IDS } from '@/constants/research'
import type { EvidenceItem } from '@/types/research'
import {
  buildResearchQueryPlan,
  confidenceOfTier,
  runAssistantResearch,
  toAssistantEvidence,
} from '@/services/research/research-fanout.service'

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

beforeEach(() => {
  vi.clearAllMocks()
  mockIsWebSearchConfigured.mockReturnValue(true)
  mockFetchWebSearchEvidence.mockResolvedValue({ items: [] })
  mockFetchMediaWikiEvidence.mockResolvedValue({ items: [] })
  mockFetchDanbooruEvidence.mockResolvedValue({ items: [] })
  mockFetchBilibiliEvidence.mockResolvedValue({ items: [] })
})

describe('buildResearchQueryPlan（A3：查询表不截角色名）', () => {
  it('⭐ maxQueries=3 时保底三条：作品名 / 角色名 / 作品+角色', () => {
    const plan = buildResearchQueryPlan('外貌 服饰', ['无限大', '时夜'])
    // 🔬 旧实现在这里把「时夜」挤掉了：长查询占第一条、别名占后两条。
    expect(plan.queries).toEqual(['无限大', '时夜', '无限大 时夜'])
    expect(plan.queries).toContain('时夜')
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

  it('空白实体被丢掉；单实体时 wiki 腿就查它', () => {
    const plan = buildResearchQueryPlan('goal', ['  ', 'x'])
    expect(plan.queries).toEqual(['x', 'x goal', 'goal'])
    expect(plan.wikiQuery).toBe('x')
  })
})

describe('confidenceOfTier', () => {
  it('官方 → high · 百科 → medium · 社区 → low', () => {
    expect(confidenceOfTier('official')).toBe('high')
    expect(confidenceOfTier('community')).toBe('medium')
    expect(confidenceOfTier('social')).toBe('low')
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
    await runAssistantResearch({
      goal: '外貌',
      entities: ['鸣潮', '今州'],
    })

    // ⚠ 三个 wiki 源都发出去了（Fandom 这一轮解析得出子站）。
    expect(mockFetchMediaWikiEvidence).toHaveBeenCalledTimes(
      MEDIAWIKI_SOURCE_IDS.length,
    )
    expect(mockFetchWebSearchEvidence).toHaveBeenCalledTimes(1)
    expect(mockFetchDanbooruEvidence).toHaveBeenCalledTimes(1)
    expect(mockFetchBilibiliEvidence).not.toHaveBeenCalled()
  })

  it('模型指定 sources 时只打那几组', async () => {
    await runAssistantResearch({ goal: '外貌', sources: ['web'] })

    expect(mockFetchWebSearchEvidence).toHaveBeenCalledTimes(1)
    expect(mockFetchMediaWikiEvidence).not.toHaveBeenCalled()
    expect(mockFetchDanbooruEvidence).not.toHaveBeenCalled()
  })

  it('⭐ A1：缺 SERPER_API_KEY 只把 web_search 标 skipped，百科腿照跑', async () => {
    mockIsWebSearchConfigured.mockReturnValue(false)
    mockFetchMediaWikiEvidence.mockResolvedValue({ items: [textItem()] })

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['鸣潮', '今州'],
    })

    // ⛔ 一把 Serper 钥匙不许锁上免 key 的那几扇门。
    expect(mockFetchWebSearchEvidence).not.toHaveBeenCalled()
    expect(mockFetchMediaWikiEvidence).toHaveBeenCalled()
    expect(mockFetchDanbooruEvidence).toHaveBeenCalled()
    expect(outcome.evidence.length).toBeGreaterThan(0)

    const web = outcome.receipts.find(
      (receipt) => receipt.sourceId === RESEARCH_SOURCE_IDS.webSearch,
    )
    expect(web?.status).toBe('skipped')
    expect(web?.error).toBe('missing SERPER_API_KEY')
  })

  it('⭐ A3：wiki 腿吃「作品 + 角色」，网搜吃整张查询表', async () => {
    await runAssistantResearch({
      goal: '外貌 服饰',
      entities: ['无限大', 'Ananta', '时夜'],
      sources: ['wiki', 'web'],
    })

    expect(mockFetchWebSearchEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: ['无限大', '时夜', '无限大 时夜'],
      }),
    )
    // ⛔ 不再是 `queries.at(-1)` 漂到的那个别名。
    expect(mockFetchMediaWikiEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '无限大 时夜',
        entities: ['无限大', 'Ananta', '时夜'],
      }),
    )
  })

  it('⭐ A4：Fandom 按实体解析子站 —— 原神走 genshin-impact，⛔ 不再恒返鸣潮', async () => {
    await runAssistantResearch({
      goal: '角色设定',
      entities: ['原神', '钟离'],
      sources: ['wiki'],
    })

    const fandomCall = mockFetchMediaWikiEvidence.mock.calls.find(
      ([arg]) =>
        (arg as { site: { sourceId: string } }).site.sourceId ===
        RESEARCH_SOURCE_IDS.fandom,
    )
    const site = (fandomCall?.[0] as { site: { api: string } }).site
    expect(site.api).toContain('genshin-impact.fandom.com')
    expect(site.api).not.toContain('wutheringwaves')
  })

  it('⭐ A4：表里没有的作品 → skipped: no fandom site，⛔ 不退回任何子域', async () => {
    const outcome = await runAssistantResearch({
      goal: '角色设定',
      entities: ['某部没人写过的作品', '某角色'],
      sources: ['wiki'],
    })

    const fandom = outcome.receipts.find(
      (receipt) => receipt.sourceId === RESEARCH_SOURCE_IDS.fandom,
    )
    expect(fandom?.status).toBe('skipped')
    expect(fandom?.error).toBe('no fandom site')
    expect(
      mockFetchMediaWikiEvidence.mock.calls.some(
        ([arg]) =>
          (arg as { site: { sourceId: string } }).site.sourceId ===
          RESEARCH_SOURCE_IDS.fandom,
      ),
    ).toBe(false)
  })

  it('⭐ A2：连接器判掉不相关的页 → 回执 unrelated（⛔ 不折进 empty）', async () => {
    mockFetchMediaWikiEvidence.mockResolvedValue({
      items: [],
      unrelated:
        '萌娘百科 returned "时之歌", which does not match 无限大 / 时夜',
    })

    const outcome = await runAssistantResearch({
      goal: '角色设定',
      entities: ['无限大', '时夜'],
      sources: ['wiki'],
    })

    const moegirl = outcome.receipts.find(
      (receipt) => receipt.sourceId === RESEARCH_SOURCE_IDS.moegirl,
    )
    // 「搜到了但不是它」与「没料」下一步该做的事不同：前者换名字重查。
    expect(moegirl?.status).toBe('unrelated')
    expect(moegirl?.error).toContain('时之歌')
    // ⛔ 不相关的页一条证据都不许交出去。
    expect(outcome.evidence).toEqual([])
  })

  it('⭐ 单源失败不拖垮整体：回执如实说 failed，其余源照常出证据', async () => {
    mockFetchDanbooruEvidence.mockRejectedValue(new Error('danbooru is down'))
    mockFetchMediaWikiEvidence.mockResolvedValue({ items: [textItem()] })

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['时夜'],
    })

    expect(outcome.evidence.length).toBeGreaterThan(0)
    const danbooru = outcome.receipts.find(
      (receipt) => receipt.sourceId === RESEARCH_SOURCE_IDS.danbooru,
    )
    // ⚠ 「源挂了」≠「没料」—— 两句话下一步该做的事完全不同。
    expect(danbooru?.status).toBe('failed')
  })

  it('同一个页面被两个源命中时只留权威档那条', async () => {
    mockFetchMediaWikiEvidence.mockResolvedValue({ items: [textItem()] })
    mockFetchWebSearchEvidence.mockResolvedValue({
      items: [
        textItem({
          id: 'web_search:shiye',
          sourceId: RESEARCH_SOURCE_IDS.webSearch,
          title: 'Google 的那条',
        } as Partial<EvidenceItem>),
      ],
    })

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['时夜'],
      sources: ['wiki', 'web'],
    })

    const sameUrl = outcome.evidence.filter(
      (item) => item.url === 'https://zh.moegirl.org.cn/shiye',
    )
    expect(sameUrl).toHaveLength(1)
    expect(sameUrl[0]?.title).toBe('萌娘百科 · 时夜')
  })

  it('尊重 limit', async () => {
    mockFetchMediaWikiEvidence.mockImplementation(
      async ({ site }: { site: { sourceId: string } }) => ({
        items: [
          textItem({
            id: `${site.sourceId}:a`,
            url: `https://${site.sourceId}.test/a`,
          } as Partial<EvidenceItem>),
        ],
      }),
    )

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['时夜'],
      sources: ['wiki'],
      limit: 1,
    })
    expect(outcome.evidence).toHaveLength(1)
  })
})
