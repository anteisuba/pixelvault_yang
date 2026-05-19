import { describe, it, expect, beforeEach } from 'vitest'

import {
  CIVITAI_SEARCH_HISTORY_MAX,
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from './civitai-search-history'

beforeEach(() => {
  window.localStorage.clear()
})

describe('civitai-search-history', () => {
  it('returns empty when storage is empty', () => {
    expect(readSearchHistory()).toEqual([])
  })

  it('records a search term', () => {
    const history = recordSearchTerm('anime girl')
    expect(history).toEqual(['anime girl'])
    expect(readSearchHistory()).toEqual(['anime girl'])
  })

  it('ignores empty / whitespace-only terms', () => {
    recordSearchTerm('first')
    expect(recordSearchTerm('   ')).toEqual(['first'])
    expect(recordSearchTerm('')).toEqual(['first'])
  })

  it('promotes an existing term to the front (case-insensitive)', () => {
    recordSearchTerm('Anime')
    recordSearchTerm('flux')
    const promoted = recordSearchTerm('anime')
    // The most-recent capitalisation wins so the dropdown shows what the
    // user just typed, not the historical casing.
    expect(promoted).toEqual(['anime', 'flux'])
  })

  it('trims whitespace before storing', () => {
    expect(recordSearchTerm('  studio ghibli  ')).toEqual(['studio ghibli'])
  })

  it(`caps history at ${CIVITAI_SEARCH_HISTORY_MAX} entries`, () => {
    for (let i = 0; i < CIVITAI_SEARCH_HISTORY_MAX + 3; i += 1) {
      recordSearchTerm(`term-${i}`)
    }
    const final = readSearchHistory()
    expect(final).toHaveLength(CIVITAI_SEARCH_HISTORY_MAX)
    // Most recent stays at index 0
    expect(final[0]).toBe(`term-${CIVITAI_SEARCH_HISTORY_MAX + 2}`)
  })

  it('clearSearchHistory wipes storage', () => {
    recordSearchTerm('keep')
    expect(clearSearchHistory()).toEqual([])
    expect(readSearchHistory()).toEqual([])
  })

  it('discards corrupted JSON gracefully', () => {
    window.localStorage.setItem(
      'pv.civitai.search-history.v1',
      '{not an array}',
    )
    expect(readSearchHistory()).toEqual([])
  })
})
