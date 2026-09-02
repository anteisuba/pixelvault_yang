import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockCount = vi.fn()
const mockCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    researchRun: {
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

// 规划器默认是恒等替身：本文件验的是**编排**（状态三态 / 配额 / 去重），
// 规划本身由 research-intent 的测试覆盖。个别用例把它换成「补了 fandomHost」的版本。
const mockPlanner = vi.fn()
vi.mock('@/services/research/research-planner.service', () => ({
  planResearchWithLlm: (...args: unknown[]) => mockPlanner(...args),
}))

const mockMediaWiki = vi.fn()
vi.mock('@/services/research/mediawiki.connector', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/research/mediawiki.connector')
  >('@/services/research/mediawiki.connector')
  return {
    ...actual,
    fetchMediaWikiEvidence: (...args: unknown[]) => mockMediaWiki(...args),
  }
})

const mockDanbooru = vi.fn()
vi.mock('@/services/research/danbooru.connector', () => ({
  fetchDanbooruEvidence: (...args: unknown[]) => mockDanbooru(...args),
}))

const mockBilibili = vi.fn()
vi.mock('@/services/research/bilibili.connector', () => ({
  fetchBilibiliEvidence: (...args: unknown[]) => mockBilibili(...args),
}))

const mockWebSearch = vi.fn()
const mockUrlReader = vi.fn()
vi.mock('@/services/research/web-search.connector', () => ({
  fetchWebSearchEvidence: (...args: unknown[]) => mockWebSearch(...args),
  fetchUrlEvidence: (...args: unknown[]) => mockUrlReader(...args),
}))

import {
  RESEARCH_DAILY_RUN_LIMIT,
  RESEARCH_MODES,
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_ID_VALUES,
  RESEARCH_SOURCE_IDS,
  RESEARCH_SOURCE_STATUSES,
  RESEARCH_UNAVAILABLE_REASONS,
} from '@/constants/research'
import { resetResearchBreakers } from '@/services/research/connector-runtime'
import {
  dedupeEvidence,
  runResearch,
} from '@/services/research/research-run.service'
import type { EvidenceItem, ResearchPlan } from '@/types/research'

const CHARACTER_QUESTION = '鸣潮长离的发色是什么'

function evidence(
  overrides: Partial<EvidenceItem> & Pick<EvidenceItem, 'sourceId'>,
): EvidenceItem {
  return {
    kind: 'text',
    id: `${overrides.sourceId}:1`,
    sourceTier: 'community',
    retrievedAt: '2026-08-20T10:00:00.000Z',
    title: 'evidence',
    excerpt: '长离是粉发。',
    ...overrides,
  } as EvidenceItem
}

function baseParams() {
  return {
    userId: 'db_user_1',
    surface: 'IMAGE_STUDIO' as const,
    text: CHARACTER_QUESTION,
    mode: RESEARCH_MODES.auto,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetResearchBreakers([...RESEARCH_SOURCE_ID_VALUES])
  mockPlanner.mockImplementation(
    async (params: { heuristic: ResearchPlan }) => params.heuristic,
  )
  mockCount.mockResolvedValue(0)
  mockCreate.mockResolvedValue({ id: 'run_1' })
  mockMediaWiki.mockResolvedValue({ items: [] })
  mockDanbooru.mockResolvedValue({ items: [] })
  mockBilibili.mockResolvedValue({ items: [] })
  mockWebSearch.mockResolvedValue({ items: [] })
  mockUrlReader.mockResolvedValue({ items: [] })
})

describe('runResearch — 什么时候根本不检索', () => {
  it('does nothing at all when the creator switched retrieval off', async () => {
    const outcome = await runResearch({
      ...baseParams(),
      mode: RESEARCH_MODES.off,
    })

    expect(outcome).toBeNull()
    expect(mockMediaWiki).not.toHaveBeenCalled()
    expect(mockWebSearch).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('skips retrieval in auto mode when the planner sees no reason to search', async () => {
    const outcome = await runResearch({ ...baseParams(), text: '你好' })

    expect(outcome).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('searches anyway in forced mode, even for a turn auto would skip', async () => {
    mockWebSearch.mockResolvedValue({
      items: [evidence({ sourceId: 'web_search' })],
    })

    const outcome = await runResearch({
      ...baseParams(),
      text: '帮我写一个赛博朋克提示词',
      mode: RESEARCH_MODES.forced,
    })

    expect(outcome).not.toBeNull()
    expect(mockWebSearch).toHaveBeenCalled()
  })
})

describe('runResearch — 三态', () => {
  it('succeeded: evidence found, grounded, persisted with per-source receipts', async () => {
    mockMediaWiki.mockResolvedValue({
      items: [
        evidence({ sourceId: 'moegirl', id: 'moegirl:text' }),
        evidence({
          sourceId: 'moegirl',
          id: 'moegirl:tags',
          kind: 'tags',
          tags: ['粉发', '金瞳'],
          provenance: '萌百 prop=categories',
        } as Partial<EvidenceItem> & { sourceId: 'moegirl' }),
      ],
    })

    const outcome = await runResearch(baseParams())

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.succeeded)
    expect(outcome?.receipt.grounded).toBe(true)
    expect(outcome?.receipt.runId).toBe('run_1')
    expect(outcome?.evidenceBlock).toContain('<<<EVIDENCE 1>>>')

    const persisted = mockCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(persisted.data.status).toBe(RESEARCH_RUN_STATUSES.succeeded)
    expect(persisted.data.grounded).toBe(true)
    // 源级回执现在就落库 —— UI 下一批要按它渲染 chip
    expect(Array.isArray(persisted.data.perSource)).toBe(true)
    expect(persisted.data.surface).toBe('IMAGE_STUDIO')
  })

  it('no_evidence: sources answered but had nothing — NOT the same as failed', async () => {
    const outcome = await runResearch(baseParams())

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.noEvidence)
    expect(outcome?.receipt.grounded).toBe(false)
    // Fandom 没有规划器给的站 → skipped；其余真打过的源全是 empty
    const attempted = outcome?.receipt.perSource.filter(
      (r) => r.status !== RESEARCH_SOURCE_STATUSES.skipped,
    )
    expect(attempted?.length).toBeGreaterThan(0)
    expect(attempted?.every((r) => r.status === 'empty')).toBe(true)
    expect(outcome?.evidenceBlock).toBe('')
  })

  it('failed: every source is broken — the creator must be told the road is out', async () => {
    const boom = () => Promise.reject(new Error('upstream is down'))
    mockMediaWiki.mockImplementation(boom)
    mockDanbooru.mockImplementation(boom)
    mockBilibili.mockImplementation(boom)
    mockWebSearch.mockImplementation(boom)

    const outcome = await runResearch(baseParams())

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.failed)
    expect(outcome?.receipt.grounded).toBe(false)
    // 每个真打过的源的失败都留了痕 —— 单源静默失败不允许（Fandom 无站 → skipped）
    const attempted = outcome?.receipt.perSource.filter(
      (receipt) => receipt.status !== RESEARCH_SOURCE_STATUSES.skipped,
    )
    expect(attempted?.length).toBeGreaterThan(0)
    expect(
      attempted?.every(
        (receipt) => receipt.status === 'failed' && receipt.error,
      ),
    ).toBe(true)
  })

  it('one broken source does not drag the rest down', async () => {
    mockMediaWiki.mockRejectedValue(new Error('moegirl blocked'))
    mockDanbooru.mockResolvedValue({
      items: [
        evidence({ sourceId: 'danbooru' }),
        evidence({ sourceId: 'danbooru', id: 'danbooru:2' }),
      ],
    })

    const outcome = await runResearch(baseParams())

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.succeeded)
    const danbooru = outcome?.receipt.perSource.find(
      (receipt) => receipt.sourceId === 'danbooru',
    )
    expect(danbooru?.status).toBe('ok')
    const moegirl = outcome?.receipt.perSource.find(
      (receipt) => receipt.sourceId === 'moegirl',
    )
    expect(moegirl?.status).toBe('failed')
  })

  it('quota_exceeded: says so explicitly and does not fire a single request', async () => {
    mockCount.mockResolvedValue(RESEARCH_DAILY_RUN_LIMIT)

    const outcome = await runResearch(baseParams())

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.quotaExceeded)
    expect(outcome?.receipt.runId).toBeNull()
    expect(mockMediaWiki).not.toHaveBeenCalled()
    // 超配额不该再写一行 run（那会让配额自己往上爬）
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('still returns a receipt when the DB write fails — retrieval already happened', async () => {
    mockCreate.mockRejectedValue(new Error('db down'))
    mockMediaWiki.mockResolvedValue({
      items: [
        evidence({ sourceId: 'moegirl' }),
        evidence({ sourceId: 'moegirl', id: 'moegirl:2' }),
      ],
    })

    const outcome = await runResearch(baseParams())

    expect(outcome?.receipt.runId).toBeNull()
    expect(outcome?.receipt.grounded).toBe(true)
  })
})

// ── 2026-09-01 附录 B「无限大」实测缺口 ──────────────────────────────
describe('runResearch — 「我想要无限大的资料」端到端（网络全 mock）', () => {
  const INFO_REQUEST = '我想要无限大的资料'

  it('plans the entity「无限大」as the wiki / danbooru query and keeps the sentence for web search only', async () => {
    const outcome = await runResearch({ ...baseParams(), text: INFO_REQUEST })

    expect(outcome?.plan.shouldSearch).toBe(true)
    expect(outcome?.plan.queries[0]?.text).toBe('无限大')

    // wiki 的 opensearch 是前缀匹配 —— 喂整句必空，必须喂主语
    for (const call of mockMediaWiki.mock.calls) {
      expect((call[0] as { query: string }).query).toBe('无限大')
    }
    expect(mockMediaWiki).toHaveBeenCalled()
    expect(mockDanbooru).toHaveBeenCalledWith({ query: '无限大' })
    // 网搜两条都拿：主语 + 整句（整句是网搜专用，不外泄给别的源）
    expect(mockWebSearch).toHaveBeenCalledWith(
      expect.objectContaining({ queries: ['无限大', INFO_REQUEST] }),
    )
  })

  it('unavailable: SERPER key absent on a web-only run — NOT「searched and found nothing」', async () => {
    mockWebSearch.mockResolvedValue({
      items: [],
      unavailable: RESEARCH_UNAVAILABLE_REASONS.missingKey,
    })

    // 「是什么」问句走通用组 → 只有网搜一个源
    const outcome = await runResearch({
      ...baseParams(),
      text: '无限大是什么',
    })

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.unavailable)
    expect(outcome?.receipt.grounded).toBe(false)
    expect(outcome?.receipt.perSource).toEqual([
      expect.objectContaining({
        sourceId: RESEARCH_SOURCE_IDS.webSearch,
        status: RESEARCH_SOURCE_STATUSES.unavailable,
        reason: RESEARCH_UNAVAILABLE_REASONS.missingKey,
      }),
    ])
    // 一个请求都没发的 run 不落库、不吃配额（与 quota_exceeded 同款）
    expect(outcome?.receipt.runId).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
    // 模型端必须听得见：不是「没搜到」，是「没配联网」
    expect(outcome?.evidenceBlock).toBe('')
    expect(outcome?.statusBlock).toContain('RESEARCH UNAVAILABLE')
  })

  it('no_evidence when the wikis answered empty but web search was unavailable — the chip still says so', async () => {
    mockWebSearch.mockResolvedValue({
      items: [],
      unavailable: RESEARCH_UNAVAILABLE_REASONS.missingKey,
    })

    const outcome = await runResearch({ ...baseParams(), text: INFO_REQUEST })

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.noEvidence)
    const web = outcome?.receipt.perSource.find(
      (receipt) => receipt.sourceId === RESEARCH_SOURCE_IDS.webSearch,
    )
    expect(web?.status).toBe(RESEARCH_SOURCE_STATUSES.unavailable)
    // 打了源但没料：模型要被告知「查了这些源、没有可用证据」，而不是什么都不说
    expect(outcome?.statusBlock).toContain('RESEARCH EXECUTED')
    expect(outcome?.statusBlock).toContain('moegirl')
    expect(outcome?.statusBlock).toContain('无限大')
  })

  it('leaves statusBlock empty when evidence exists — the evidence block already speaks', async () => {
    mockMediaWiki.mockResolvedValue({
      items: [
        evidence({ sourceId: 'moegirl' }),
        evidence({ sourceId: 'moegirl', id: 'moegirl:2' }),
      ],
    })

    const outcome = await runResearch({ ...baseParams(), text: INFO_REQUEST })

    expect(outcome?.receipt.status).toBe(RESEARCH_RUN_STATUSES.succeeded)
    expect(outcome?.statusBlock).toBe('')
  })

  it('skips Fandom honestly when the planner gave no host — no guessed wiki', async () => {
    const outcome = await runResearch({ ...baseParams(), text: INFO_REQUEST })

    const fandom = outcome?.receipt.perSource.find(
      (receipt) => receipt.sourceId === RESEARCH_SOURCE_IDS.fandom,
    )
    expect(fandom?.status).toBe(RESEARCH_SOURCE_STATUSES.skipped)
    const fandomCalls = mockMediaWiki.mock.calls.filter(
      (call) =>
        (call[0] as { site: { sourceId: string } }).site.sourceId ===
        RESEARCH_SOURCE_IDS.fandom,
    )
    expect(fandomCalls).toHaveLength(0)
  })

  it('hits the Fandom host the planner named, nothing else', async () => {
    mockPlanner.mockImplementation(
      async (params: { heuristic: ResearchPlan }) => ({
        ...params.heuristic,
        fandomHost: 'ananta.fandom.com',
        queries: [
          ...params.heuristic.queries,
          { text: 'Ananta', lang: 'en' as const },
        ],
      }),
    )

    await runResearch({ ...baseParams(), text: INFO_REQUEST })

    const fandomCall = mockMediaWiki.mock.calls.find(
      (call) =>
        (call[0] as { site: { sourceId: string } }).site.sourceId ===
        RESEARCH_SOURCE_IDS.fandom,
    )?.[0] as { site: { api: string }; query: string } | undefined
    expect(fandomCall?.site.api).toBe('https://ananta.fandom.com/api.php')
    // Fandom 是英文站 —— 有英文查询就用英文的
    expect(fandomCall?.query).toBe('Ananta')
  })
})

describe('runResearch — URL 短路', () => {
  it('reads pasted URLs and skips the search fan-out entirely', async () => {
    mockUrlReader.mockResolvedValue({
      items: [
        evidence({ sourceId: 'url_reader' }),
        evidence({ sourceId: 'url_reader', id: 'url_reader:2' }),
      ],
    })

    const outcome = await runResearch({
      ...baseParams(),
      text: '看看 https://example.com/post 说了什么',
    })

    expect(mockUrlReader).toHaveBeenCalled()
    expect(mockWebSearch).not.toHaveBeenCalled()
    expect(mockMediaWiki).not.toHaveBeenCalled()
    expect(outcome?.receipt.grounded).toBe(true)
  })
})

describe('dedupeEvidence', () => {
  it('keeps the more authoritative source when two sources hit the same page', () => {
    const deduped = dedupeEvidence([
      evidence({ sourceId: 'web_search', url: 'https://same/page' }),
      evidence({ sourceId: 'moegirl', url: 'https://same/page' }),
    ])

    expect(deduped).toHaveLength(1)
    expect(deduped[0]?.sourceId).toBe('moegirl')
  })

  it('does not let a page text item swallow the tag item from the same page', () => {
    const deduped = dedupeEvidence([
      evidence({ sourceId: 'moegirl', url: 'https://same/page' }),
      evidence({
        sourceId: 'moegirl',
        url: 'https://same/page',
        kind: 'tags',
        tags: ['粉发'],
        provenance: '萌百分类',
      } as Partial<EvidenceItem> & { sourceId: 'moegirl' }),
    ])

    expect(deduped).toHaveLength(2)
  })
})
