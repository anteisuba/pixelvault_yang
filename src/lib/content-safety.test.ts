import { describe, expect, it } from 'vitest'

import {
  getPublishBlockedErrorCode,
  isPromptBlockedFromPublic,
} from '@/lib/content-safety'

describe('isPromptBlockedFromPublic', () => {
  it('blocks an explicit term on its own (the public gallery is all-ages)', () => {
    expect(isPromptBlockedFromPublic('1girl, adult woman, nude, beach')).toBe(
      true,
    )
    expect(isPromptBlockedFromPublic('nsfw, masterpiece')).toBe(true)
    expect(isPromptBlockedFromPublic('after_sex, bed')).toBe(true)
    expect(isPromptBlockedFromPublic('全裸，海边')).toBe(true)
    expect(isPromptBlockedFromPublic('エロ、水着')).toBe(true)
  })

  it('blocks a prompt that pairs a minor term with a suggestive term', () => {
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
    expect(isPromptBlockedFromPublic('萝莉，内衣，海边')).toBe(true)
    expect(isPromptBlockedFromPublic('ロリ、パンツ')).toBe(true)
  })

  it('blocks genre terms that are sexual on their own', () => {
    expect(isPromptBlockedFromPublic('lolicon, beach')).toBe(true)
  })

  it('allows a minor term without any sexual term', () => {
    expect(
      isPromptBlockedFromPublic('a child flying a kite in a spring meadow'),
    ).toBe(false)
  })

  it('allows a suggestive term without any minor term', () => {
    expect(
      isPromptBlockedFromPublic(
        '1girl, adult woman, large breasts, cleavage, sexy, evening dress',
      ),
    ).toBe(false)
  })

  it('does not match terms inside longer words', () => {
    // brave ≠ bra · kidney ≠ kid · classy ≠ ass · unisex ≠ sex · grape ≠ rape
    expect(
      isPromptBlockedFromPublic(
        'brave knight, kidney beans, classy, unisex coat, grape juice',
      ),
    ).toBe(false)
  })

  it('does not treat 少女 or girl as a minor term', () => {
    expect(isPromptBlockedFromPublic('银发少女，1girl，cleavage')).toBe(false)
  })

  it('does not treat 裸足 (barefoot) as nudity', () => {
    expect(isPromptBlockedFromPublic('少女，裸足，草地')).toBe(false)
  })

  it('returns false for empty prompts', () => {
    expect(isPromptBlockedFromPublic('')).toBe(false)
    expect(isPromptBlockedFromPublic(null)).toBe(false)
  })
})

describe('getPublishBlockedErrorCode', () => {
  const layout = (...prompts: string[]) => ({
    advancedParams: {
      novelAiLayout: {
        positioning: 'auto',
        characters: prompts.map((prompt) => ({ prompt, position: 'C3' })),
      },
    },
  })

  it('reads NovelAI per-character prompts kept outside the prompt column', () => {
    expect(
      getPublishBlockedErrorCode({
        prompt: '2girls, classroom',
        recipe: layout('girl, red hair', 'girl, nude'),
      }),
    ).toBe('CONTENT_NOT_PUBLISHABLE')
  })

  it('judges the scene and the characters together', () => {
    expect(
      getPublishBlockedErrorCode({
        prompt: 'child, park',
        recipe: layout('girl, panties'),
      }),
    ).toBe('CONTENT_NOT_PUBLISHABLE')
  })

  it('lets clean character prompts and unknown recipe shapes through', () => {
    expect(
      getPublishBlockedErrorCode({
        prompt: '2girls, cafe',
        recipe: layout('girl, red hair', 'girl, school uniform'),
      }),
    ).toBeNull()
    expect(
      getPublishBlockedErrorCode({ prompt: 'cafe', recipe: { version: 1 } }),
    ).toBeNull()
    expect(getPublishBlockedErrorCode({ prompt: 'cafe', recipe: null })).toBe(
      null,
    )
  })

  it('blocks search-grounded works before reading the prompt', () => {
    expect(
      getPublishBlockedErrorCode({
        prompt: 'Taipei 101',
        searchGrounded: true,
      }),
    ).toBe('SEARCH_GROUNDED_NOT_PUBLISHABLE')
  })
})
