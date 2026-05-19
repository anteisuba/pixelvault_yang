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
  it('covers all six camera angles (front + five non-front)', () => {
    expect(Object.keys(MULTI_VIEW_PROMPTS).sort()).toEqual([
      'back',
      'front',
      'left',
      'leftFront',
      'right',
      'rightFront',
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

  it('each prompt locks the drift vectors that hurt 3D reconstruction', () => {
    for (const prompt of Object.values(MULTI_VIEW_PROMPTS)) {
      expect(prompt.toLowerCase()).toContain('hand pose')
      expect(prompt.toLowerCase()).toContain('finger placement')
      expect(prompt.toLowerCase()).toContain('body proportions')
    }
  })

  it('45-degree diagonal prompts state the rotation explicitly', () => {
    expect(MULTI_VIEW_PROMPTS.leftFront.toLowerCase()).toContain(
      '45 degrees counter-clockwise',
    )
    expect(MULTI_VIEW_PROMPTS.rightFront.toLowerCase()).toContain(
      '45 degrees clockwise',
    )
  })
})

describe('MULTI_VIEW_NEGATIVE', () => {
  it('blocks unwanted drift without forcing source prep constraints', () => {
    expect(MULTI_VIEW_NEGATIVE).toContain('different identity')
    expect(MULTI_VIEW_NEGATIVE).toContain('different outfit')
    expect(MULTI_VIEW_NEGATIVE).toContain('changed pose')
    expect(MULTI_VIEW_NEGATIVE).toContain('forced full body')
  })

  it('blocks the specific drift vectors that wreck 3D reconstruction', () => {
    expect(MULTI_VIEW_NEGATIVE).toContain('different hand position')
    expect(MULTI_VIEW_NEGATIVE).toContain('different finger placement')
    expect(MULTI_VIEW_NEGATIVE).toContain('changed hairstyle')
    expect(MULTI_VIEW_NEGATIVE).toContain('changed proportions')
    expect(MULTI_VIEW_NEGATIVE).toContain('perspective distortion')
    expect(MULTI_VIEW_NEGATIVE).toContain('dramatic lighting change')
  })
})

describe('GENERATED_VIEW_ANGLES', () => {
  it('auto-generates the three orthogonal non-front angles', () => {
    expect(GENERATED_VIEW_ANGLES).toEqual(['back', 'left', 'right'])
  })

  it('is a subset of MULTI_VIEW_PROMPTS keys (45° variants kept for manual use)', () => {
    const promptKeys = new Set(Object.keys(MULTI_VIEW_PROMPTS))
    for (const angle of GENERATED_VIEW_ANGLES) {
      expect(promptKeys.has(angle)).toBe(true)
    }
  })
})
