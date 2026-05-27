import { describe, it, expect, beforeEach } from 'vitest'

import {
  CIVITAI_SEARCH_HISTORY_MAX,
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from './civitai-search-history'

const TEST_CLERK_ID = 'user_test_clerk_1'
const OTHER_CLERK_ID = 'user_test_clerk_2'
const TEST_STORAGE_KEY = `pv.civitai.search-history.v2.${TEST_CLERK_ID}`
const LEGACY_GLOBAL_STORAGE_KEY = 'pv.civitai.search-history.v1'

beforeEach(() => {
  window.localStorage.clear()
})

describe('civitai-search-history', () => {
  it('returns empty when storage is empty', () => {
    expect(readSearchHistory(TEST_CLERK_ID)).toEqual([])
  })

  it('records a search term', () => {
    const history = recordSearchTerm('anime girl', TEST_CLERK_ID)
    expect(history).toEqual(['anime girl'])
    expect(readSearchHistory(TEST_CLERK_ID)).toEqual(['anime girl'])
  })

  it('ignores empty / whitespace-only terms', () => {
    recordSearchTerm('first', TEST_CLERK_ID)
    expect(recordSearchTerm('   ', TEST_CLERK_ID)).toEqual(['first'])
    expect(recordSearchTerm('', TEST_CLERK_ID)).toEqual(['first'])
  })

  it('promotes an existing term to the front (case-insensitive)', () => {
    recordSearchTerm('Anime', TEST_CLERK_ID)
    recordSearchTerm('flux', TEST_CLERK_ID)
    const promoted = recordSearchTerm('anime', TEST_CLERK_ID)
    // The most-recent capitalisation wins so the dropdown shows what the
    // user just typed, not the historical casing.
    expect(promoted).toEqual(['anime', 'flux'])
  })

  it('trims whitespace before storing', () => {
    expect(recordSearchTerm('  studio ghibli  ', TEST_CLERK_ID)).toEqual([
      'studio ghibli',
    ])
  })

  it(`caps history at ${CIVITAI_SEARCH_HISTORY_MAX} entries`, () => {
    for (let i = 0; i < CIVITAI_SEARCH_HISTORY_MAX + 3; i += 1) {
      recordSearchTerm(`term-${i}`, TEST_CLERK_ID)
    }
    const final = readSearchHistory(TEST_CLERK_ID)
    expect(final).toHaveLength(CIVITAI_SEARCH_HISTORY_MAX)
    // Most recent stays at index 0
    expect(final[0]).toBe(`term-${CIVITAI_SEARCH_HISTORY_MAX + 2}`)
  })

  it('clearSearchHistory wipes storage', () => {
    recordSearchTerm('keep', TEST_CLERK_ID)
    expect(clearSearchHistory(TEST_CLERK_ID)).toEqual([])
    expect(readSearchHistory(TEST_CLERK_ID)).toEqual([])
  })

  it('discards corrupted JSON gracefully', () => {
    window.localStorage.setItem(TEST_STORAGE_KEY, '{not an array}')
    expect(readSearchHistory(TEST_CLERK_ID)).toEqual([])
  })

  it('scopes storage per clerkId so two accounts cannot see each other', () => {
    recordSearchTerm('private to A', TEST_CLERK_ID)
    expect(readSearchHistory(OTHER_CLERK_ID)).toEqual([])
    recordSearchTerm('private to B', OTHER_CLERK_ID)
    expect(readSearchHistory(TEST_CLERK_ID)).toEqual(['private to A'])
    expect(readSearchHistory(OTHER_CLERK_ID)).toEqual(['private to B'])
  })

  it('refuses to read a snapshot whose ownerClerkId does not match', () => {
    // Plant a snapshot under user A's key but with B's ownerClerkId.
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        ownerClerkId: OTHER_CLERK_ID,
        terms: ['should be ignored'],
      }),
    )
    expect(readSearchHistory(TEST_CLERK_ID)).toEqual([])
  })

  it('returns empty and never writes localStorage when clerkId is null', () => {
    expect(readSearchHistory(null)).toEqual([])
    // record() still returns the in-memory list, but skips persistence.
    expect(recordSearchTerm('ephemeral', null)).toEqual(['ephemeral'])
    expect(window.localStorage.length).toBe(0)
  })

  it('purges the pre-v2 global localStorage key on first read', () => {
    window.localStorage.setItem(
      LEGACY_GLOBAL_STORAGE_KEY,
      JSON.stringify(['leaky', 'data']),
    )
    readSearchHistory(TEST_CLERK_ID)
    expect(window.localStorage.getItem(LEGACY_GLOBAL_STORAGE_KEY)).toBeNull()
  })
})
