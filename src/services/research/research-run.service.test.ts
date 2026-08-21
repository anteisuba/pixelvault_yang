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

// 规划器在这里是恒等替身：本文件验的是**编排**（状态三态 / 配额 / 去重），
// 规划本身由 research-intent 的测试覆盖。
vi.mock('@/services/research/research-planner.service', () => ({
  planResearchWithLlm: async (params: { heuristic: unknown }) =>
    params.heuristic,
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
} from '@/constants/research'
import { resetResearchBreakers } from '@/services/research/connector-runtime'
import {
  dedupeEvidence,
  runResearch,
} from '@/services/research/research-run.service'
import type { EvidenceItem } from '@/types/research'

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
    expect(outcome?.receipt.perSource.every((r) => r.status === 'empty')).toBe(
      true,
    )
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
    // 每个源的失败都留了痕 —— 单源静默失败不允许
    expect(
      outcome?.receipt.perSource.every(
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
