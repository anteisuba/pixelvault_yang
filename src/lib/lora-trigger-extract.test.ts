import { describe, expect, it } from 'vitest'

import { extractCivitaiTrigger } from './lora-trigger-extract'

describe('extractCivitaiTrigger', () => {
  // ─── Pattern 1: empty trainedWords (~30% of real data) ───────────────

  it('infers CJK character name from model name when trainedWords is empty', () => {
    const result = extractCivitaiTrigger({
      trainedWords: [],
      modelName: '鸣潮 (Wuthering Waves) || 达妮娅 (Denia)',
    })
    expect(result.trigger).toBe('鸣潮')
    expect(result.source).toBe('inferred')
    expect(result.recommendedPrompt).toBeNull()
    expect(result.alternates).toEqual([])
  })

  it('infers English token from model name skipping generic stop words', () => {
    const result = extractCivitaiTrigger({
      trainedWords: undefined,
      modelName: 'Yor Forger SoloLoRA',
    })
    expect(result.trigger).toBe('Yor')
    expect(result.source).toBe('inferred')
  })

  it('falls back to first 60 chars of model name when nothing else works', () => {
    const result = extractCivitaiTrigger({
      trainedWords: [],
      modelName: 'lora',
    })
    // "lora" is in stop words → no token → falls back to model name slice
    expect(result.trigger).toBe('lora')
    expect(result.source).toBe('inferred')
  })

  // ─── Pattern 2: single long comma-separated prompt (~50%) ────────────

  it('extracts first token from a long comma-separated trainedWord', () => {
    const result = extractCivitaiTrigger({
      trainedWords: [
        'hifumi takimoto, takimoto hifumi, long hair, bangs, blue eyes, bow',
      ],
      modelName: 'Hifumi Takimoto (滝本 ひふみ) - New Game!',
    })
    expect(result.trigger).toBe('hifumi takimoto')
    expect(result.source).toBe('official')
    expect(result.recommendedPrompt).toBe(
      'hifumi takimoto, takimoto hifumi, long hair, bangs, blue eyes, bow',
    )
    expect(result.alternates).toEqual([])
  })

  it('unescapes \\(...\\) parens in the primary trigger', () => {
    const result = extractCivitaiTrigger({
      trainedWords: [
        'sigrika \\(wuthering waves\\), 1girl, orange hair, hair ornament',
      ],
      modelName: 'Anima | sigrika',
    })
    expect(result.trigger).toBe('sigrika (wuthering waves)')
    expect(result.source).toBe('official')
    expect(result.recommendedPrompt).toBe(
      'sigrika (wuthering waves), 1girl, orange hair, hair ornament',
    )
  })

  // ─── Pattern 3: SD WebUI lora syntax pollution (~10%) ────────────────

  it('strips <lora:...> syntax before extracting the trigger', () => {
    const result = extractCivitaiTrigger({
      trainedWords: ['<lora:youji_kyougi:1>, youji_kyougi, 1girl, blue eyes'],
      modelName: '[ILXL] Youji Kyougi 供犠羊司',
    })
    expect(result.trigger).toBe('youji_kyougi')
    expect(result.recommendedPrompt).not.toContain('<lora')
    expect(result.source).toBe('official')
  })

  // ─── Pattern 4: multiple outfits / variants (~10%) ───────────────────

  it('exposes alternate triggers from additional trainedWords entries', () => {
    const result = extractCivitaiTrigger({
      trainedWords: [
        'cure mystique, pink hair, magical girl',
        'kobayashi mikuru, school uniform',
        'mikuru transformed, sparkles',
      ],
      modelName: 'Cure Mystique キュアミスティック / Kobayashi Mikuru',
    })
    expect(result.trigger).toBe('cure mystique')
    expect(result.alternates).toEqual([
      'kobayashi mikuru',
      'mikuru transformed',
    ])
    expect(result.source).toBe('official')
  })

  it('dedupes alternate triggers case-insensitively against the primary', () => {
    const result = extractCivitaiTrigger({
      trainedWords: [
        'Yor Briar, black hair',
        'yor briar, school uniform', // dup primary, must be dropped
        'Yor Forger, evening dress',
      ],
      modelName: 'Yor Briar / Forger',
    })
    expect(result.trigger).toBe('Yor Briar')
    expect(result.alternates).toEqual(['Yor Forger'])
  })

  // ─── Pattern 5: clean single token (rare but valid) ──────────────────

  it('handles a clean single-token trainedWord like @bxz', () => {
    const result = extractCivitaiTrigger({
      trainedWords: ['@bxz'],
      modelName: 'anima watercolor-style',
    })
    expect(result.trigger).toBe('@bxz')
    expect(result.source).toBe('official')
    expect(result.recommendedPrompt).toBe('@bxz')
    expect(result.alternates).toEqual([])
  })

  // ─── Defense: never crash, always returns non-empty trigger ──────────

  it('returns a non-empty trigger even for whitespace-only inputs', () => {
    const result = extractCivitaiTrigger({
      trainedWords: ['   ', ''],
      modelName: '   ',
    })
    expect(result.trigger.length).toBeGreaterThan(0)
    expect(result.source).toBe('inferred')
  })
})
