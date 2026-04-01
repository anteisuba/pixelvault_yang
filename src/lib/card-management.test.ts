import { describe, expect, it } from 'vitest'

import {
  matchesCardSearch,
  sortCardManagerItems,
} from '@/lib/card-management'

describe('card-management helpers', () => {
  it('matches search queries against names and tags', () => {
    expect(
      matchesCardSearch('forest', ['Forest Shrine', ['mood', 'night']]),
    ).toBe(true)
    expect(
      matchesCardSearch('night', ['Forest Shrine', ['mood', 'night']]),
    ).toBe(true)
    expect(matchesCardSearch('mecha', ['Forest Shrine', ['mood', 'night']])).toBe(
      false,
    )
  })

  it('sorts by recent usage and falls back to created time', () => {
    const items = [
      {
        id: 'a',
        name: 'Alpha',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        lastUsedAt: null,
      },
      {
        id: 'b',
        name: 'Beta',
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        lastUsedAt: new Date('2026-04-03T00:00:00.000Z'),
      },
      {
        id: 'c',
        name: 'Gamma',
        createdAt: new Date('2026-04-04T00:00:00.000Z'),
        lastUsedAt: null,
      },
    ]

    const sorted = sortCardManagerItems(
      items,
      'recent',
      (item) => item.name,
      (item) => item.createdAt,
      (item) => item.lastUsedAt,
    )

    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })
})
