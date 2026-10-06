import { describe, expect, it } from 'vitest'

import { isPromptBlockedFromPublic } from '@/lib/content-safety'

describe('isPromptBlockedFromPublic', () => {
  it('blocks a prompt that pairs a minor term with a sexual term', () => {
    expect(
      isPromptBlockedFromPublic(
        'official art, shy, child, from behind, hug, downblouse, detailed eyes',
      ),
    ).toBe(true)
  })

  it('reads Danbooru underscores and weight syntax as plain words', () => {
    expect(
      isPromptBlockedFromPublic('(young_girl:1.2), 1.5::spread_legs::'),
    ).toBe(true)
  })

  it('blocks CJK terms by substring', () => {
    expect(isPromptBlockedFromPublic('萝莉，裸体，海边')).toBe(true)
    expect(isPromptBlockedFromPublic('ロリ、エロ')).toBe(true)
  })

  it('blocks genre terms that are sexual on their own', () => {
    expect(isPromptBlockedFromPublic('lolicon, beach')).toBe(true)
  })

  it('allows a minor term without any sexual term', () => {
    expect(
      isPromptBlockedFromPublic('a child flying a kite in a spring meadow'),
    ).toBe(false)
  })

  it('allows a sexual term without any minor term', () => {
    expect(
      isPromptBlockedFromPublic('1girl, adult woman, cleavage, evening dress'),
    ).toBe(false)
  })

  it('does not match terms inside longer words', () => {
    // brave ≠ bra · kidney ≠ kid · classy ≠ ass
    expect(
      isPromptBlockedFromPublic('brave knight, kidney beans, classy'),
    ).toBe(false)
  })

  it('does not treat 少女 or girl as a minor term', () => {
    expect(isPromptBlockedFromPublic('银发少女，1girl，cleavage')).toBe(false)
  })

  it('returns false for empty prompts', () => {
    expect(isPromptBlockedFromPublic('')).toBe(false)
    expect(isPromptBlockedFromPublic(null)).toBe(false)
  })
})
