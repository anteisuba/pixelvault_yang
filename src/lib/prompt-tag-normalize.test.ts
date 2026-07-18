import { describe, expect, it } from 'vitest'

import {
  buildLoraAssistantTagResults,
  filterLoraAssistantOutputTags,
  normalizeLoraAssistantTag,
} from '@/lib/prompt-tag-normalize'
import type { PromptTagDefinition } from '@/types/prompt-tags'

const definitions = [
  {
    id: 'danbooru:hair:silver_hair',
    type: 'character_trait',
    source: 'danbooru',
    label: 'Silver Hair',
    promptText: 'silver_hair',
    aliases: ['银发'],
    category: 'hair_color',
    polarity: 'positive',
    modelFamilies: ['any'],
    orderGroup: 40,
    popularity: 30,
  },
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
    id: 'danbooru:general:1girl',
    type: 'subject',
    source: 'danbooru',
    label: '1girl',
    promptText: '1girl',
    aliases: [],
    category: 'general',
    polarity: 'positive',
    modelFamilies: ['any'],
    orderGroup: 5,
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

describe('normalizeLoraAssistantTag', () => {
  // ── 命中规范化 ────────────────────────────────────────────────
  it('classifies an exact promptText match (modulo underscore/space) as a hit with no `normalized` flag', () => {
    const result = normalizeLoraAssistantTag('silver hair', definitions)

    expect(result).toEqual({
      text: 'silver hair',
      canonical: 'silver_hair',
      category: 'hair_color',
      popularity: 30,
    })
    expect(result.normalized).toBeUndefined()
    expect(result.free).toBeUndefined()
  })

  it('classifies an exact alias match (Chinese) as a hit', () => {
    const result = normalizeLoraAssistantTag('银发', definitions)

    expect(result.canonical).toBe('silver_hair')
    expect(result.normalized).toBeUndefined()
  })

  // ── 模糊替换 ──────────────────────────────────────────────────
  it('classifies a superset phrase as a fuzzy hit and flags `normalized: true`', () => {
    const result = normalizeLoraAssistantTag('silver hair color', definitions)

    expect(result.canonical).toBe('silver_hair')
    expect(result.normalized).toBe(true)
    expect(result.text).toBe('silver hair color')
  })

  it('classifies a subset phrase as a fuzzy hit against the longer label', () => {
    // "best quality" alias fully contains "quality" — not equal, so fuzzy.
    const result = normalizeLoraAssistantTag('quality', definitions)

    expect(result.canonical).toBe('masterpiece')
    expect(result.normalized).toBe(true)
  })

  // ── 自由词标记 ────────────────────────────────────────────────
  it('flags an unmatched tag as a free word, keeping the original text untouched', () => {
    const result = normalizeLoraAssistantTag(
      'floating lanterns at dusk',
      definitions,
    )

    expect(result).toEqual({
      text: 'floating lanterns at dusk',
      free: true,
    })
    expect(result.canonical).toBeUndefined()
  })

  it('treats an empty/whitespace tag as a free word without throwing', () => {
    expect(normalizeLoraAssistantTag('   ', definitions)).toEqual({
      text: '   ',
      free: true,
    })
  })

  it('does not classify a too-short fragment as a fuzzy hit against unrelated longer fields', () => {
    // Single-char query below the min-field-length guard should not fuzzy-match.
    const result = normalizeLoraAssistantTag('a', definitions)
    expect(result.free).toBe(true)
  })
})

describe('filterLoraAssistantOutputTags', () => {
  // ── 触发词绝不出现在输出 ──────────────────────────────────────
  it('strips exact trigger word matches from LLM output (case/format-insensitive)', () => {
    const result = filterLoraAssistantOutputTags(
      ['Silver_Hair', 'masterpiece', '1girl'],
      { triggerWords: ['silver hair'], trayTags: [] },
    )

    expect(result).toEqual(['masterpiece', '1girl'])
  })

  it('strips a trigger word even when the LLM output wraps it in extra words', () => {
    const result = filterLoraAssistantOutputTags(
      ['silver hair twintails', 'masterpiece'],
      { triggerWords: ['silver hair'], trayTags: [] },
    )

    expect(result).toEqual(['masterpiece'])
  })

  it('does not let a single-character trigger word wipe out unrelated output', () => {
    const result = filterLoraAssistantOutputTags(['masterpiece', '1girl'], {
      triggerWords: ['a'],
      trayTags: [],
    })

    expect(result).toEqual(['masterpiece', '1girl'])
  })

  // ── trayTags 去重 ─────────────────────────────────────────────
  it('drops tags already present in the tray', () => {
    const result = filterLoraAssistantOutputTags(['1girl', 'outdoors'], {
      triggerWords: [],
      trayTags: ['1girl'],
    })

    expect(result).toEqual(['outdoors'])
  })

  it('self-dedupes repeated tags within the same output array', () => {
    const result = filterLoraAssistantOutputTags(
      ['masterpiece', 'Masterpiece', 'masterpiece '],
      { triggerWords: [], trayTags: [] },
    )

    expect(result).toEqual(['masterpiece'])
  })

  it('trims blank entries', () => {
    const result = filterLoraAssistantOutputTags(['  ', 'masterpiece', ''], {
      triggerWords: [],
      trayTags: [],
    })

    expect(result).toEqual(['masterpiece'])
  })
})

describe('buildLoraAssistantTagResults (F1 full output pipeline)', () => {
  it('never lets a trigger word survive into the final normalized result', () => {
    const results = buildLoraAssistantTagResults(
      ['silver hair', 'masterpiece', '1girl'],
      { triggerWords: ['silver hair'], trayTags: [] },
      definitions,
    )

    expect(results.map((r) => r.text)).toEqual(['masterpiece', '1girl'])
    expect(results.some((r) => r.canonical === 'silver_hair')).toBe(false)
  })

  it('drops trayTags before normalizing and normalizes the rest', () => {
    const results = buildLoraAssistantTagResults(
      ['1girl', 'silver hair'],
      { triggerWords: [], trayTags: ['1girl'] },
      definitions,
    )

    expect(results).toEqual([
      {
        text: 'silver hair',
        canonical: 'silver_hair',
        category: 'hair_color',
        popularity: 30,
      },
    ])
  })

  it('mixes hit and free-word results in the same call', () => {
    const results = buildLoraAssistantTagResults(
      ['masterpiece', 'a mysterious floating city'],
      { triggerWords: [], trayTags: [] },
      definitions,
    )

    expect(results).toEqual([
      {
        text: 'masterpiece',
        canonical: 'masterpiece',
        category: 'quality',
        popularity: undefined,
      },
      { text: 'a mysterious floating city', free: true },
    ])
  })
})
