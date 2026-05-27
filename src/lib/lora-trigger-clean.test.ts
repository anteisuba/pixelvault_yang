import { describe, expect, it } from 'vitest'

import {
  cleanRecommendedPrompt,
  cleanTriggerToken,
  splitAndCleanTrainedWord,
} from './lora-trigger-clean'

describe('cleanTriggerToken', () => {
  it('strips SD WebUI <lora:...> syntax', () => {
    expect(cleanTriggerToken('<lora:my-style:0.8>')).toBe('')
    // lora syntax is dropped, then whitespace collapses to a single space.
    expect(cleanTriggerToken('hello <lora:x:1> world')).toBe('hello world')
  })

  it('unescapes \\( and \\) into plain parens', () => {
    expect(cleanTriggerToken('sigrika \\(wuthering waves\\)')).toBe(
      'sigrika (wuthering waves)',
    )
  })

  it('collapses whitespace', () => {
    expect(cleanTriggerToken('  hello   world  ')).toBe('hello world')
  })

  it('strips leading/trailing commas and full-width spaces', () => {
    expect(cleanTriggerToken('，hello，')).toBe('，hello，') // 全角逗号不动
    expect(cleanTriggerToken(', hello ,')).toBe('hello')
    expect(cleanTriggerToken('　hello　')).toBe('hello')
  })

  it('returns empty for nullish or empty input', () => {
    expect(cleanTriggerToken('')).toBe('')
  })
})

describe('splitAndCleanTrainedWord', () => {
  it('splits a comma-separated trainedWord into clean tokens', () => {
    const input =
      'sigrika \\(wuthering waves\\), 1girl, orange hair, hair ornament'
    expect(splitAndCleanTrainedWord(input)).toEqual([
      'sigrika (wuthering waves)',
      '1girl',
      'orange hair',
      'hair ornament',
    ])
  })

  it('strips lora syntax before splitting', () => {
    const input = '<lora:youji:1>, youji_kyougi, 1girl'
    // First piece becomes empty after stripping → filtered out
    expect(splitAndCleanTrainedWord(input)).toEqual(['youji_kyougi', '1girl'])
  })

  it('dedupes case-insensitively while preserving first-seen order', () => {
    const input = 'Yor Briar, yor briar, Black Hair, BLACK HAIR'
    expect(splitAndCleanTrainedWord(input)).toEqual(['Yor Briar', 'Black Hair'])
  })

  it('returns [] for empty input', () => {
    expect(splitAndCleanTrainedWord('')).toEqual([])
  })

  it('handles single-token input (the @bxz pattern)', () => {
    expect(splitAndCleanTrainedWord('@bxz')).toEqual(['@bxz'])
  })
})

describe('cleanRecommendedPrompt', () => {
  it('cleans escapes and normalises comma spacing without splitting tokens', () => {
    const input =
      'hifumi takimoto,takimoto hifumi,  long hair, bangs ,blue eyes'
    expect(cleanRecommendedPrompt(input)).toBe(
      'hifumi takimoto, takimoto hifumi, long hair, bangs, blue eyes',
    )
  })

  it('removes lora syntax and reduces resulting double commas', () => {
    const input = '<lora:youji:1>, youji_kyougi, 1girl'
    // Lora syntax leaves an empty slot; cleanup should collapse the spacing.
    expect(cleanRecommendedPrompt(input)).toBe(
      ', youji_kyougi, 1girl'.replace(/^, /, ''),
    )
  })

  it('returns empty for empty input', () => {
    expect(cleanRecommendedPrompt('')).toBe('')
  })

  it('keeps full-width characters intact (CJK)', () => {
    expect(cleanRecommendedPrompt('达妮娅, 1girl, 长发')).toBe(
      '达妮娅, 1girl, 长发',
    )
  })
})
