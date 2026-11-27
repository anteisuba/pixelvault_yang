import { describe, expect, it } from 'vitest'
import {
  formatNovelAiTagDisplay,
  getNovelAiRecognitionTier,
  hasCjkOrNonAscii,
  isValidTagAutocompleteQuery,
  pickLocalizedTagName,
  toDanbooruUnderscoreTag,
} from './tag-recognition'

describe('tag-recognition', () => {
  it('distinguishes ASCII and CJK/non-ASCII autocomplete thresholds', () => {
    expect(hasCjkOrNonAscii('rain')).toBe(false)
    expect(hasCjkOrNonAscii('双马尾')).toBe(true)
    expect(hasCjkOrNonAscii('猫')).toBe(true)

    expect(isValidTagAutocompleteQuery('')).toBe(false)
    expect(isValidTagAutocompleteQuery('a')).toBe(false)
    expect(isValidTagAutocompleteQuery('ra')).toBe(true)
    expect(isValidTagAutocompleteQuery('雨')).toBe(true)
    expect(isValidTagAutocompleteQuery('猫耳')).toBe(true)
    expect(isValidTagAutocompleteQuery('a'.repeat(201))).toBe(false)
  })

  it('normalizes prompt tags to Danbooru underscore keys', () => {
    expect(toDanbooruUnderscoreTag('Long Hair')).toBe('long_hair')
    expect(toDanbooruUnderscoreTag('artist:wlop')).toBe('wlop')
    expect(toDanbooruUnderscoreTag('hatsune miku \\(append\\)')).toBe(
      'hatsune_miku_(append)',
    )
  })

  it('formats Danbooru tags for NovelAI prompt input', () => {
    expect(formatNovelAiTagDisplay('long_hair', 0)).toBe('long hair')
    expect(formatNovelAiTagDisplay('wlop', 1)).toBe('artist:wlop')
    expect(formatNovelAiTagDisplay('watercolor_(medium)', 1)).toBe(
      'watercolor (medium)',
    )
  })

  it('computes 4-tier recognition from count, confidence, and source', () => {
    expect(getNovelAiRecognitionTier({ count: 50_000 })).toBe('high')
    expect(getNovelAiRecognitionTier({ count: 2_400 })).toBe('mid')
    expect(getNovelAiRecognitionTier({ count: 120 })).toBe('low')
    expect(getNovelAiRecognitionTier({ confidence: 0.8 })).toBe('high')
    expect(getNovelAiRecognitionTier({ confidence: 0.4 })).toBe('mid')
    expect(getNovelAiRecognitionTier({ confidence: 0.1 })).toBe('low')
    expect(getNovelAiRecognitionTier({ source: 'official' })).toBe('mid')
    expect(getNovelAiRecognitionTier({ known: true })).toBe('mid')
    expect(getNovelAiRecognitionTier({ count: 0, known: false })).toBe(
      'unknown',
    )
  })

  it('picks localized tag names according to locale', () => {
    const names = { zh: '双马尾', ja: 'ツインテール' }
    expect(pickLocalizedTagName(names, 'zh')).toBe('双马尾')
    expect(pickLocalizedTagName(names, 'zh-CN')).toBe('双马尾')
    expect(pickLocalizedTagName(names, 'ja')).toBe('ツインテール')
    expect(pickLocalizedTagName(names, 'en')).toBeNull()
  })
})
