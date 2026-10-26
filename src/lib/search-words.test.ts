import { describe, expect, it } from 'vitest'

import { matchesAnyWord, tagWord, withWordMatches } from './search-words'

describe('search words', () => {
  it('turns tag names into the spaced spelling', () => {
    expect(tagWord('cat_ears')).toBe('cat ears')
    expect(tagWord('night_city_(cyberpunk)')).toBe('night city (cyberpunk)')
  })

  it('matches whole words only, with spaces or underscores', () => {
    expect(matchesAnyWord('1girl, rain, street', ['rain'])).toBe(true)
    expect(matchesAnyWord('training ground, brain', ['rain'])).toBe(false)
    expect(matchesAnyWord('1girl, cat_ears', ['cat ears'])).toBe(true)
    expect(matchesAnyWord('CAT EARS', ['cat ears'])).toBe(true)
    expect(matchesAnyWord('雨,rain', ['rain'])).toBe(true)
    expect(
      matchesAnyWord('night city (cyberpunk)', ['night city (cyberpunk)']),
    ).toBe(true)
    expect(matchesAnyWord(null, ['rain'])).toBe(false)
    expect(matchesAnyWord('rain', [])).toBe(false)
  })

  it('keeps literal matches first and appends word matches in list order', () => {
    const all = ['rain street', 'sunny', '下雨', 'heavy rain', 'training']
    expect(withWordMatches(all, ['下雨'], ['rain'], (item) => [item])).toEqual([
      '下雨',
      'rain street',
      'heavy rain',
    ])
    expect(withWordMatches(all, ['下雨'], [], (item) => [item])).toEqual([
      '下雨',
    ])
  })
})
