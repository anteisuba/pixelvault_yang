import { describe, expect, it } from 'vitest'

import { searchPromptTags } from '@/lib/prompt-tag-search'
import type { PromptTagDefinition } from '@/types/prompt-tags'

const definitions = [
  {
    id: 'system:quality:masterpiece',
    type: 'quality',
    source: 'system',
    label: 'Masterpiece',
    promptText: 'masterpiece',
    aliases: ['best quality'],
    category: 'quality',
    polarity: 'positive',
    modelFamilies: ['any'],
    orderGroup: 10,
  },
  {
    id: 'danbooru:general:solo',
    type: 'subject',
    source: 'danbooru',
    label: 'Solo',
    promptText: 'solo',
    aliases: ['solo focus'],
    category: 'general',
    polarity: 'positive',
    modelFamilies: ['any'],
    orderGroup: 40,
    popularity: 50,
  },
  {
    id: 'system:negative:blur',
    type: 'negative',
    source: 'system',
    label: 'Blur',
    promptText: 'blurry',
    aliases: ['out of focus'],
    category: 'quality',
    polarity: 'negative',
    modelFamilies: ['any'],
    orderGroup: 20,
  },
] satisfies readonly PromptTagDefinition[]

describe('searchPromptTags', () => {
  it('matches labels, prompt text, and aliases within the requested polarity', () => {
    const results = searchPromptTags({
      query: 'best quality',
      definitions,
      polarity: 'positive',
    })

    expect(results.map((result) => result.tag.id)).toEqual([
      'system:quality:masterpiece',
    ])
    expect(results[0]?.matchedAlias).toBe('best quality')
  })

  it('keeps negative tags out of positive results', () => {
    const results = searchPromptTags({
      query: 'blur',
      definitions,
      polarity: 'positive',
    })

    expect(results).toEqual([])
  })

  it('sorts selected tags after addable matches', () => {
    const results = searchPromptTags({
      query: '',
      definitions,
      polarity: 'positive',
      selectedTagIds: new Set(['system:quality:masterpiece']),
    })

    expect(results.at(-1)?.tag.id).toBe('system:quality:masterpiece')
  })
})
