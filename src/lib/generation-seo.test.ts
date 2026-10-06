import { describe, expect, it } from 'vitest'

import {
  buildPromptAltText,
  buildPromptTitleSummary,
  clampDisplayText,
  cleanPromptForDisplay,
} from '@/lib/generation-seo'

describe('cleanPromptForDisplay', () => {
  it('strips NovelAI weights and quality tags', () => {
    expect(
      cleanPromptForDisplay(
        'official art::silver hair, 20::best quality, absurdres, very aesthetic::, no text, 8k, masterpiece, 1.5::foreshortening::, shorekeeper \\(wuthering waves\\)',
      ),
    ).toBe('silver hair, foreshortening, shorekeeper wuthering waves')
  })

  it('strips A1111 weights, LoRA tags and score tags', () => {
    expect(
      cleanPromptForDisplay(
        'score_9, score_8_up, <lora:style_v2:0.8>, (red_scarf:1.3), [snow], night city',
      ),
    ).toBe('red scarf, snow, night city')
  })

  it('dedupes case-insensitively and keeps natural-language commas', () => {
    expect(
      cleanPromptForDisplay(
        'A white cottage, Pink roses, pink roses, soft moonlight',
      ),
    ).toBe('A white cottage, Pink roses, soft moonlight')
  })

  it('joins multi-line sentences without stacking a comma on punctuation', () => {
    expect(cleanPromptForDisplay('正对着角色，上半身。\n近景，微笑')).toBe(
      '正对着角色，上半身。近景，微笑',
    )
    expect(cleanPromptForDisplay('A quiet street.\nSoft rain')).toBe(
      'A quiet street. Soft rain',
    )
  })

  it('returns an empty string for empty or all-noise prompts', () => {
    expect(cleanPromptForDisplay('')).toBe('')
    expect(cleanPromptForDisplay('masterpiece, best quality, 8k')).toBe('')
  })
})

describe('clampDisplayText', () => {
  it('leaves short text alone', () => {
    expect(clampDisplayText('night city', 40)).toBe('night city')
  })

  it('backs off to a word boundary for Latin text', () => {
    expect(clampDisplayText('silver hair, red scarf, night city', 20)).toBe(
      'silver hair, red…',
    )
  })

  it('hard-cuts CJK text without spaces', () => {
    expect(clampDisplayText('银发少女站在雪夜的城市街头', 6)).toBe(
      '银发少女站在…',
    )
  })
})

describe('title summary and alt text', () => {
  it('builds both from the cleaned prompt', () => {
    const prompt = 'masterpiece, best quality, silver hair, red scarf'
    expect(buildPromptTitleSummary(prompt)).toBe('silver hair, red scarf')
    expect(buildPromptAltText(prompt)).toBe('silver hair, red scarf')
  })

  it('returns an empty string when the prompt is redacted', () => {
    expect(buildPromptTitleSummary('')).toBe('')
    expect(buildPromptAltText('')).toBe('')
  })
})
