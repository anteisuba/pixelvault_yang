import { describe, expect, it } from 'vitest'

import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_NEGATIVE,
  MULTI_VIEW_PROMPTS,
  THREE_D_READY_NEGATIVE,
} from './three-d-ready-prompt'

describe('THREE_D_READY_NEGATIVE', () => {
  it('includes the high-ROI negatives', () => {
    expect(THREE_D_READY_NEGATIVE).toContain('motion blur')
    expect(THREE_D_READY_NEGATIVE).toContain('bokeh')
    expect(THREE_D_READY_NEGATIVE).toContain('harsh shadow')
    expect(THREE_D_READY_NEGATIVE).toContain('multiple subjects')
  })
})

describe('MULTI_VIEW_PROMPTS', () => {
  it('covers four cardinal angles', () => {
    expect(Object.keys(MULTI_VIEW_PROMPTS).sort()).toEqual([
      'back',
      'front',
      'left',
      'right',
    ])
  })

  it('each prompt enforces identity preservation', () => {
    for (const prompt of Object.values(MULTI_VIEW_PROMPTS)) {
      expect(prompt.toLowerCase()).toContain('same subject')
      expect(prompt.toLowerCase()).toContain('exact identity')
      expect(prompt.toLowerCase()).toContain('original action')
      expect(prompt.toLowerCase()).toContain('art style')
      expect(prompt.toLowerCase()).toContain('clothing')
      expect(prompt.toLowerCase()).toContain('same framing')
    }
  })
})

describe('MULTI_VIEW_NEGATIVE', () => {
  it('blocks unwanted drift without forcing source prep constraints', () => {
    expect(MULTI_VIEW_NEGATIVE).toContain('different identity')
    expect(MULTI_VIEW_NEGATIVE).toContain('different outfit')
    expect(MULTI_VIEW_NEGATIVE).toContain('changed pose')
    expect(MULTI_VIEW_NEGATIVE).toContain('forced full body')
  })
})

describe('GENERATED_VIEW_ANGLES', () => {
  it('lists the three non-front angles in stable order', () => {
    expect(GENERATED_VIEW_ANGLES).toEqual(['back', 'left', 'right'])
  })
})
