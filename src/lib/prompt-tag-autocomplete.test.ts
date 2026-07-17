import { describe, expect, it } from 'vitest'

import {
  applyPromptTagSegmentReplacement,
  extractPromptTagSegment,
  getPromptTagPopularityTier,
} from '@/lib/prompt-tag-autocomplete'

describe('extractPromptTagSegment', () => {
  it('returns the whole value as the segment when there is no delimiter', () => {
    const segment = extractPromptTagSegment('long', 4)
    expect(segment).toEqual({ start: 0, end: 4, text: 'long' })
  })

  it('bounds the segment to text after the nearest comma before the cursor', () => {
    const value = 'masterpiece, long'
    const segment = extractPromptTagSegment(value, value.length)
    expect(segment).toEqual({ start: 13, end: 17, text: 'long' })
  })

  it('skips the leading space after a comma when computing the segment start', () => {
    const value = 'masterpiece, lo'
    const segment = extractPromptTagSegment(value, value.length)
    expect(segment?.text).toBe('lo')
    expect(value[segment!.start]).toBe('l')
  })

  it('bounds the segment to text after a newline', () => {
    const value = 'first line\nsecond'
    const segment = extractPromptTagSegment(value, value.length)
    expect(segment).toEqual({ start: 11, end: 17, text: 'second' })
  })

  it('returns null when the cursor sits right after a delimiter (empty segment)', () => {
    const segment = extractPromptTagSegment('foo, ', 5)
    expect(segment).toBeNull()
  })

  it('returns null for an all-whitespace value', () => {
    expect(extractPromptTagSegment('   ', 3)).toBeNull()
  })

  it('ignores text after the cursor — only the typed prefix counts', () => {
    // Cursor sits between "lo" and "ng": segment should stop at the cursor,
    // not swallow the rest of the word the user hasn't "typed up to" yet.
    const value = 'long'
    const segment = extractPromptTagSegment(value, 2)
    expect(segment).toEqual({ start: 0, end: 2, text: 'lo' })
  })

  it('clamps an out-of-range cursor into the value bounds', () => {
    const segment = extractPromptTagSegment('long', 999)
    expect(segment).toEqual({ start: 0, end: 4, text: 'long' })
  })
})

describe('applyPromptTagSegmentReplacement', () => {
  it('replaces the segment with promptText + ", " and lands the cursor after it', () => {
    const value = 'masterpiece, long'
    const segment = extractPromptTagSegment(value, value.length)!
    const result = applyPromptTagSegmentReplacement(value, segment, 'long_hair')
    expect(result.value).toBe('masterpiece, long_hair, ')
    expect(result.cursor).toBe(result.value.length)
  })

  it('preserves text after the segment (mid-string edits)', () => {
    const value = 'lo, extra text after'
    const segment = extractPromptTagSegment(value, 2)! // cursor right after "lo"
    const result = applyPromptTagSegmentReplacement(value, segment, 'long_hair')
    expect(result.value).toBe('long_hair, , extra text after')
    expect(result.cursor).toBe('long_hair, '.length)
  })
})

describe('getPromptTagPopularityTier', () => {
  it('buckets undefined popularity as low', () => {
    expect(getPromptTagPopularityTier(undefined)).toBe('low')
  })

  it('buckets values below the mid threshold as low', () => {
    expect(getPromptTagPopularityTier(16)).toBe('low')
  })

  it('buckets values at/above mid but below high as mid', () => {
    expect(getPromptTagPopularityTier(17)).toBe('mid')
    expect(getPromptTagPopularityTier(33)).toBe('mid')
  })

  it('buckets values at/above the high threshold as high', () => {
    expect(getPromptTagPopularityTier(34)).toBe('high')
    expect(getPromptTagPopularityTier(50)).toBe('high')
  })
})
