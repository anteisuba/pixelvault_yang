import { describe, expect, it } from 'vitest'

import {
  extractActivationSegment,
  summariseActivationSegments,
} from './civitai-image-prompt-mine'

describe('extractActivationSegment', () => {
  const PROMPT = `official style,anime coloring,(anime screencap) masterpiece,best quality,
maiden,slim figure,<lora:detailed hand focus style illustriousXL v1.1:0.8>,detailed,<lora:EnchantingEyesIllustrious:0.8>,(white background:1.3),1girl,solo,
<lora:DeniaV1-Nuclear1811-IL:0.9>,purple eyes,pink pupils,pink hair,multicolored hair,c1,white hair ribbon,white dress,2d style,
full body,on stomach,legs up,looking at viewer`

  it('slices tokens immediately after the matching <lora:NAME:W> tag', () => {
    const out = extractActivationSegment(PROMPT, 'DeniaV1-Nuclear1811-IL')
    expect(out).toBeTruthy()
    expect(out).toContain('purple eyes')
    expect(out).toContain('c1') // the real activation token, buried mid-segment
    expect(out).toContain('2d style')
    // stops at the next \n (which separates pose / composition tokens)
    expect(out).not.toContain('full body')
    expect(out).not.toContain('legs up')
  })

  it('matches the lora name case-insensitively', () => {
    const out = extractActivationSegment(PROMPT, 'deniav1-nuclear1811-il')
    expect(out).toContain('purple eyes')
  })

  it('stops at the next <lora:..> tag when no newline intervenes', () => {
    const p =
      '<lora:foo:1>,trigger_foo,token_a,<lora:bar:0.5>,trigger_bar,token_b'
    expect(extractActivationSegment(p, 'foo')).toBe('trigger_foo, token_a')
    expect(extractActivationSegment(p, 'bar')).toBe('trigger_bar, token_b')
  })

  it('returns null when the LoRA is not referenced', () => {
    expect(extractActivationSegment(PROMPT, 'NotInPrompt')).toBeNull()
  })

  it('returns null for empty inputs', () => {
    expect(extractActivationSegment('', 'foo')).toBeNull()
    expect(extractActivationSegment('some prompt', '')).toBeNull()
  })

  it('escapes regex special chars in the lora name', () => {
    const p = '<lora:weird.name(v2):0.7>,trigger_x'
    expect(extractActivationSegment(p, 'weird.name(v2)')).toBe('trigger_x')
  })

  it('handles trailing-end LoRA (no delimiter ahead)', () => {
    const p = 'preface,<lora:onlyLora:1>,token_a,token_b'
    expect(extractActivationSegment(p, 'onlyLora')).toBe('token_a, token_b')
  })
})

describe('summariseActivationSegments', () => {
  it('clusters segments that share the first 3 tokens', () => {
    const segs = [
      'purple eyes, pink pupils, pink hair, c1, ribbon',
      'purple eyes, pink pupils, pink hair, c1, ribbon, longer tail',
      'black halo, purple eyes, pink hair, c2, ornament',
    ]
    const out = summariseActivationSegments(segs)
    expect(out).toHaveLength(2)
    // c1 cluster: 2 samples
    expect(out[0]?.sampleCount).toBe(2)
    expect(out[0]?.prompt).toContain('c1')
    // longer variant wins as the representative
    expect(out[0]?.prompt).toContain('longer tail')
    // c2 cluster: 1 sample
    expect(out[1]?.sampleCount).toBe(1)
    expect(out[1]?.prompt).toContain('c2')
  })

  it('sorts by sampleCount desc, then by prompt length desc', () => {
    const segs = [
      'short, a, b',
      'short, a, b',
      'short, a, b, with more tokens',
      'other, c, d',
    ]
    const out = summariseActivationSegments(segs)
    expect(out[0]?.sampleCount).toBe(3)
    expect(out[1]?.sampleCount).toBe(1)
  })

  it('skips empty and whitespace-only segments', () => {
    expect(summariseActivationSegments(['', '   ', '\n'])).toEqual([])
  })

  it('returns [] for empty input', () => {
    expect(summariseActivationSegments([])).toEqual([])
  })
})
