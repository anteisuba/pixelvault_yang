import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'

import {
  computeVideoRebindPreview,
  hasIgnoredRebindings,
} from './video-rebind-preview'

describe('computeVideoRebindPreview', () => {
  it('keeps image references (character/background) mapped on any model', () => {
    const items = computeVideoRebindPreview(
      ['character', 'background'],
      AI_MODELS.SEEDANCE_20,
    )
    expect(items).toEqual([
      { kind: 'character', status: 'map' },
      { kind: 'background', status: 'map' },
    ])
  })

  it('ignores voice on an audio=auto model (no voice cloning)', () => {
    // SEEDANCE_20 has no audio capability → defaults to mode 'auto'.
    const items = computeVideoRebindPreview(['voice'], AI_MODELS.SEEDANCE_20)
    expect(items[0]).toEqual({ kind: 'voice', status: 'ignore' })
  })

  it('maps voice on an audio=reference model', () => {
    const items = computeVideoRebindPreview(
      ['voice'],
      AI_MODELS.SEEDANCE_20_REFERENCE,
    )
    expect(items[0]).toEqual({ kind: 'voice', status: 'map' })
  })

  it('handles an empty binding set', () => {
    expect(computeVideoRebindPreview([], AI_MODELS.SEEDANCE_20)).toEqual([])
  })
})

describe('hasIgnoredRebindings', () => {
  it('is true when any binding is ignored', () => {
    expect(
      hasIgnoredRebindings([
        { kind: 'character', status: 'map' },
        { kind: 'voice', status: 'ignore' },
      ]),
    ).toBe(true)
  })

  it('is false when every binding maps', () => {
    expect(hasIgnoredRebindings([{ kind: 'character', status: 'map' }])).toBe(
      false,
    )
  })
})
