import { describe, expect, it } from 'vitest'

import { auditPublicRows, type PublicRow } from './audit-public-content'

const row = (id: string, overrides: Partial<PublicRow> = {}): PublicRow => ({
  id,
  userId: 'u1',
  prompt: 'night city, red scarf',
  recipe: null,
  searchGrounded: false,
  outputType: 'IMAGE',
  isFeatured: false,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  ...overrides,
})

describe('auditPublicRows', () => {
  it('counts public works the current publish gate would block, by reason and type', () => {
    const audit = auditPublicRows([
      row('ok'),
      row('explicit', { prompt: '1girl, nude' }),
      row('video', { prompt: 'nsfw dance', outputType: 'VIDEO' }),
      row('grounded', { prompt: 'Taipei 101', searchGrounded: true }),
    ])

    expect(audit.total).toBe(4)
    expect(audit.blocked.map((r) => r.id)).toEqual([
      'explicit',
      'video',
      'grounded',
    ])
    expect(audit.blockedByCode).toEqual({
      CONTENT_NOT_PUBLISHABLE: 2,
      SEARCH_GROUNDED_NOT_PUBLISHABLE: 1,
    })
    expect(audit.blockedByOutputType).toEqual({ IMAGE: 2, VIDEO: 1 })
  })
})
