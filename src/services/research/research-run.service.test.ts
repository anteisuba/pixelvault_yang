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
// 规划本身由 research-intent 的测试覆盖。⚠ 记下入参：要验路由原样交过去。
const mockPlanResearchWithLlm = vi.fn(
  async (params: { heuristic: unknown }) => params.heuristic,
)
vi.mock('@/services/research/research-planner.service', () => ({
  planResearchWithLlm: (params: { heuristic: unknown }) =>
    mockPlanResearchWithLlm(params),
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

import { RESEARCH_SOURCE_ID_VALUES } from '@/constants/research'
import { resetResearchBreakers } from '@/services/research/connector-runtime'
import { dedupeEvidence } from '@/services/research/research-run.service'
import type { EvidenceItem } from '@/types/research'

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
