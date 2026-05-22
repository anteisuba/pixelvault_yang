import { describe, expect, it } from 'vitest'

import { filterByQuery } from './search-utils'

interface Item {
  name: string
  subtitle?: string | null
  tags?: string[]
}

const items: Item[] = [
  { name: 'FLUX 1.1', subtitle: 'pro', tags: ['fast', 'photoreal'] },
  { name: 'Veo 3.1', subtitle: null, tags: ['video'] },
  { name: 'Midjourney v6', subtitle: 'discord', tags: [] },
  { name: 'SDXL Turbo', tags: ['anime'] },
]

describe('filterByQuery', () => {
  it('returns a copy of the full list when query is empty', () => {
    const result = filterByQuery(items, '', (i) => [i.name])
    expect(result).toEqual(items)
    expect(result).not.toBe(items)
  })

  it('returns the full list when query is only whitespace', () => {
    expect(filterByQuery(items, '   ', (i) => [i.name])).toEqual(items)
  })

  it('matches case-insensitively on a single field', () => {
    const result = filterByQuery(items, 'flux', (i) => [i.name])
    expect(result.map((i) => i.name)).toEqual(['FLUX 1.1'])
  })

  it('matches across multiple fields via join semantics', () => {
    // Joined haystack for the first item is "FLUX 1.1 pro fast photoreal"
    // — "pro fast" appears as a substring even though "pro" is the subtitle
    // and "fast" is a tag. Cross-field matching is the point of join semantics.
    const result = filterByQuery(items, 'pro fast', (i) => [
      i.name,
      i.subtitle,
      ...(i.tags ?? []),
    ])
    expect(result.map((i) => i.name)).toEqual(['FLUX 1.1'])
  })

  it('drops nullish and empty fields without crashing', () => {
    // Veo has subtitle: null and no tags overlap — should not match "discord"
    const result = filterByQuery(items, 'discord', (i) => [i.name, i.subtitle])
    expect(result.map((i) => i.name)).toEqual(['Midjourney v6'])
  })

  it('trims surrounding whitespace from the query', () => {
    const result = filterByQuery(items, '   anime   ', (i) => [
      i.name,
      ...(i.tags ?? []),
    ])
    expect(result.map((i) => i.name)).toEqual(['SDXL Turbo'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterByQuery(items, 'nonexistent', (i) => [i.name])).toEqual([])
  })

  it('preserves original item order', () => {
    const result = filterByQuery(items, 'o', (i) => [
      i.name,
      i.subtitle,
      ...(i.tags ?? []),
    ])
    // All items contain "o" somewhere; order must match input
    expect(result).toEqual(items)
  })
})
