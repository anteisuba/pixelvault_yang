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
  confidenceOfCredibility,
  countCorroboration,
  runAssistantResearch,
  summarizeResearchConclusion,
  scopeOfEvidence,
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
        queries: [
          '无限大 时夜',
          '无限大 时夜 角色 设定',
          'Ananta 时夜 キャラクター',
        ],
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

describe('runAssistantResearch · 角色级（2026-09-07）', () => {
  it('⭐ danbooru 收到的是**角色名 + 作品名**，⛔ 不再是 queries[0]（作品名）', async () => {
    await runAssistantResearch({
      goal: '外貌 服饰',
      entities: ['无限大', 'Ananta', '时夜'],
      sources: ['danbooru'],
    })

    // 🔬 旧实现喂作品名，回来的是 game tag 的全作品统计（别人的兔耳朵）。
    expect(mockFetchDanbooruEvidence).toHaveBeenCalledWith({
      query: '时夜',
      work: '无限大',
    })
  })

  it('没有角色名时 danbooru 照旧查作品本身（那时问的就是作品）', async () => {
    await runAssistantResearch({
      goal: '这游戏是什么',
      entities: ['无限大'],
      sources: ['danbooru'],
    })
    expect(mockFetchDanbooruEvidence).toHaveBeenCalledWith({ query: '无限大' })
  })

  it('⭐ 官方域出 official/high，未知域回落玩家整理/low', async () => {
    mockFetchWebSearchEvidence.mockResolvedValue({
      items: [
        textItem({
          id: 'web_search:official',
          sourceId: RESEARCH_SOURCE_IDS.webSearch,
          title: '无限大 - 网易',
          url: 'https://ananta.163.com/m/',
          excerpt: '时夜. 我负责出钱，你负责出力。',
        } as Partial<EvidenceItem>),
        textItem({
          id: 'web_search:blog',
          sourceId: RESEARCH_SOURCE_IDS.webSearch,
          title: '某人的整理',
          url: 'https://mugendai-matome.com/260/',
          excerpt: '主人公の幼馴染。',
        } as Partial<EvidenceItem>),
      ],
    })

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
    mockFetchDanbooruEvidence.mockResolvedValue({
      items: [
        textItem({
          id: 'danbooru:tag',
          sourceId: RESEARCH_SOURCE_IDS.danbooru,
          kind: 'tags',
          title: 'danbooru · shiye_(ananta)',
          url: 'https://danbooru.donmai.us/wiki_pages/shiye',
          tags: ['black_hair', 'red_streaks'],
          provenance: '共现统计',
        } as Partial<EvidenceItem>),
      ],
    })

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['无限大', '时夜'],
      sources: ['danbooru'],
    })
    expect(outcome.evidence[0]?.scope).toBe('character')
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
    mockFetchMediaWikiEvidence.mockResolvedValue({
      items: [
        textItem({
          id: 'a',
          title: '只有一个人这么说',
          url: 'https://a.test/x',
        }),
        textItem(),
      ],
    })
    mockFetchWebSearchEvidence.mockResolvedValue({
      items: [
        textItem({
          id: 'b',
          sourceId: RESEARCH_SOURCE_IDS.webSearch,
          url: 'https://zh.wikipedia.org/wiki/shiye',
        }),
      ],
    })

    const outcome = await runAssistantResearch({
      goal: '外貌',
      entities: ['无限大', '时夜'],
    })

    expect(outcome.evidence[0]?.corroboration).toBe(2)
    expect(outcome.evidence.at(-1)?.corroboration).toBe(1)
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

    expect(mockFetchWebSearchEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: ['无限大 时夜 设定', 'Ananta Shiye design'],
      }),
    )
    // wiki 吃的仍然是「作品 + 角色」那条页名，⛔ 不是改写出来的长查询。
    expect(mockFetchMediaWikiEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ query: '无限大 时夜' }),
    )
  })
})
