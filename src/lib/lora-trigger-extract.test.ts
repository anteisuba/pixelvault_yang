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
    expect(result.recommendedPromptAlternates).toEqual([])
    expect(result.alternates).toEqual([])
  })

  // ─── Pattern 1b: empty trainedWords BUT description has code blocks
  //   This is the user-reported "screenshot bug" case: the character LoRA
  //   left trainedWords empty and put activation prompts in description
  //   <pre><code> blocks instead. The real trigger `c1` is buried inside
  //   the prompt — only copying the full prompt activates the LoRA.

  it('lifts outfit prompts from description <pre><code> when trainedWords is empty', () => {
    const html = `<p><strong>outfits:</strong></p>
<p><strong>costume1</strong></p>
<pre><code>purple eyes,pink pupils,pink hair,c1,white hair ribbon,2d style,</code></pre>
<p><strong>costume2</strong></p>
<pre><code>black halo,purple eyes,c2,black hair ribbon,2d style,</code></pre>`
    const result = extractCivitaiTrigger({
      trainedWords: [],
      modelName: '鸣潮 (Wuthering Waves) || 达妮娅 (Denia)',
      descriptionHtml: html,
    })
    // Author wrote prompts in description → treat as 'official' even
    // though trainedWords is empty; users copying the full prompt will
    // correctly activate the LoRA.
    expect(result.source).toBe('official')
    expect(result.recommendedPrompt).toContain('c1')
    expect(result.recommendedPrompt).toContain('white hair ribbon')
    expect(result.recommendedPromptAlternates).toHaveLength(1)
    expect(result.recommendedPromptAlternates[0]?.label).toBe('costume2')
    expect(result.recommendedPromptAlternates[0]?.prompt).toContain('c2')
    // Trigger word is still inferred from model name (no good way to pick
    // a single token from "purple eyes, pink pupils, ..., c1, ..."), so
    // the UI should rely on recommendedPrompt as the primary path.
    expect(result.trigger).toBe('鸣潮')
  })

  it('prefers trainedWords over description when both exist', () => {
    const html = '<pre><code>fallback_prompt</code></pre>'
    const result = extractCivitaiTrigger({
      trainedWords: ['real_trigger, 1girl'],
      modelName: 'Some Model',
      descriptionHtml: html,
    })
    expect(result.trigger).toBe('real_trigger')
    expect(result.recommendedPrompt).toBe('real_trigger, 1girl')
    expect(result.recommendedPromptAlternates).toEqual([])
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
