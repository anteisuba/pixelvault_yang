import { describe, it, expect } from 'vitest'

import {
  applyPlaceholders,
  extractPlaceholders,
  hasPlaceholders,
} from '@/lib/prompt-placeholders'

describe('extractPlaceholders', () => {
  it('returns an empty array for plain prompts', () => {
    expect(extractPlaceholders('a cat in a garden')).toEqual([])
  })

  it('extracts a single placeholder', () => {
    expect(extractPlaceholders('paint [OBJECT] vividly')).toEqual(['OBJECT'])
  })

  it('extracts multiple placeholders in order of first appearance', () => {
    expect(
      extractPlaceholders('shoot [BRAND] with [PRODUCT] in [BACKGROUND]'),
    ).toEqual(['BRAND', 'PRODUCT', 'BACKGROUND'])
  })

  it('de-duplicates repeated placeholders', () => {
    expect(extractPlaceholders('[OBJECT] near [BRAND], on [OBJECT]')).toEqual([
      'OBJECT',
      'BRAND',
    ])
  })

  it('accepts placeholders with digits and underscores', () => {
    expect(
      extractPlaceholders('use [PRODUCT_1] then [PRODUCT_2] and [STYLE_KEY]'),
    ).toEqual(['PRODUCT_1', 'PRODUCT_2', 'STYLE_KEY'])
  })

  it('ignores single-letter brackets and lowercase tokens', () => {
    expect(extractPlaceholders('[A] [x] [Cat] [B1] [LONG]')).toEqual([
      'B1',
      'LONG',
    ])
  })

  it('ignores JSON-like braces in the prompt body', () => {
    const jsonPrompt = '{ "subject": "[OBJECT]", "params": { "iso": 100 } }'
    expect(extractPlaceholders(jsonPrompt)).toEqual(['OBJECT'])
  })

  it('handles empty/null-ish input safely', () => {
    expect(extractPlaceholders('')).toEqual([])
  })
})

describe('applyPlaceholders', () => {
  it('substitutes a single placeholder', () => {
    expect(
      applyPlaceholders('paint [OBJECT] vividly', { OBJECT: 'a vase' }),
    ).toBe('paint a vase vividly')
  })

  it('trims values when substituting', () => {
    expect(applyPlaceholders('paint [OBJECT]', { OBJECT: '  a vase  ' })).toBe(
      'paint a vase',
    )
  })

  it('substitutes every occurrence of a placeholder', () => {
    expect(
      applyPlaceholders('[OBJECT] next to [OBJECT]', { OBJECT: 'lamp' }),
    ).toBe('lamp next to lamp')
  })

  it('keeps unfilled placeholders intact', () => {
    expect(
      applyPlaceholders('paint [OBJECT] near [BRAND]', { OBJECT: 'cat' }),
    ).toBe('paint cat near [BRAND]')
  })

  it('treats empty / whitespace-only values as unfilled', () => {
    expect(applyPlaceholders('paint [OBJECT]', { OBJECT: '   ' })).toBe(
      'paint [OBJECT]',
    )
  })

  it('leaves non-placeholder brackets untouched', () => {
    expect(applyPlaceholders('use [x] and [B1]', { B1: 'Bee' })).toBe(
      'use [x] and Bee',
    )
  })

  it('is a no-op on an empty prompt', () => {
    expect(applyPlaceholders('', { OBJECT: 'cat' })).toBe('')
  })
})

describe('hasPlaceholders', () => {
  it('is true when the prompt contains a placeholder', () => {
    expect(hasPlaceholders('paint [OBJECT]')).toBe(true)
  })

  it('is false for plain prompts', () => {
    expect(hasPlaceholders('paint a cat')).toBe(false)
  })

  it('is false for malformed brackets', () => {
    expect(hasPlaceholders('use [a] or [Cat] or [A]')).toBe(false)
  })

  it('is stateless across calls (regex lastIndex reset)', () => {
    const prompt = 'paint [OBJECT]'
    expect(hasPlaceholders(prompt)).toBe(true)
    expect(hasPlaceholders(prompt)).toBe(true)
    expect(hasPlaceholders(prompt)).toBe(true)
  })

  it('is false for empty input', () => {
    expect(hasPlaceholders('')).toBe(false)
  })
})
