import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

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
