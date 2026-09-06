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
vi.mock('@/services/research/mediawiki.connector', () => ({
  fetchMediaWikiEvidence: (...args: unknown[]) =>
    mockFetchMediaWikiEvidence(...args),
}))
vi.mock('@/services/research/danbooru.connector', () => ({
  fetchDanbooruEvidence: (...args: unknown[]) =>
    mockFetchDanbooruEvidence(...args),
}))
vi.mock('@/services/research/bilibili.connector', () => ({
  fetchBilibiliEvidence: (...args: unknown[]) =>
    mockFetchBilibiliEvidence(...args),
}))

import { MEDIAWIKI_SITES, RESEARCH_SOURCE_IDS } from '@/constants/research'
import type { EvidenceItem } from '@/types/research'
import {
  buildResearchQueries,
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
  mockFetchWebSearchEvidence.mockResolvedValue({ items: [] })
  mockFetchMediaWikiEvidence.mockResolvedValue({ items: [] })
  mockFetchDanbooruEvidence.mockResolvedValue({ items: [] })
  mockFetchBilibiliEvidence.mockResolvedValue({ items: [] })
})

describe('buildResearchQueries', () => {
  it('第一条是「实体 + 目标」（长查询喂网搜），后面是干净的实体名（喂 wiki）', () => {
    expect(buildResearchQueries('外貌 服饰', ['无限大', '时夜'])).toEqual([
      '无限大 时夜 外貌 服饰',
      '无限大',
      '时夜',
    ])
  })

  it('没有实体时只发目标本身，⛔ 不编一个实体出来', () => {
    expect(buildResearchQueries('ananta official site', [])).toEqual([
      'ananta official site',
    ])
  })

  it('空白实体被丢掉', () => {
    expect(buildResearchQueries('goal', ['  ', 'x'])).toEqual(['x goal', 'x'])
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
  it('默认打 wiki（三个站）+ 网搜 + danbooru，⛔ 默认不打 B站', async () => {
    await runAssistantResearch({ goal: '外貌', entities: ['时夜'] })

    expect(mockFetchMediaWikiEvidence).toHaveBeenCalledTimes(
      MEDIAWIKI_SITES.length,
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

  it('⚠ wiki 吃的是干净页名（最后一条），网搜吃的是整串长查询', async () => {
    await runAssistantResearch({
      goal: '外貌 服饰',
      entities: ['无限大', '时夜'],
      sources: ['wiki', 'web'],
    })

    expect(mockFetchWebSearchEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: ['无限大 时夜 外貌 服饰', '无限大', '时夜'],
      }),
    )
    expect(mockFetchMediaWikiEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ query: '时夜' }),
    )
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
