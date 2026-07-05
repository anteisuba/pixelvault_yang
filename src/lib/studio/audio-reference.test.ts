import { describe, expect, it } from 'vitest'

import { resolveInlineAudioReference } from './audio-reference'

describe('resolveInlineAudioReference', () => {
  it('drops a card clip that has no transcript (the 400 regression)', () => {
    expect(
      resolveInlineAudioReference({
        cardReferenceAudioUrl: 'https://cdn.example.com/card.wav',
        cardSampleText: null,
        adHocReferenceUrl: null,
        adHocReferenceText: '',
      }),
    ).toEqual({ referenceAudioUrl: undefined, referenceText: undefined })
  })

  it('drops an ad-hoc clip uploaded without a transcript', () => {
    expect(
      resolveInlineAudioReference({
        adHocReferenceUrl: 'https://cdn.example.com/adhoc.wav',
        adHocReferenceText: '   ',
      }),
    ).toEqual({ referenceAudioUrl: undefined, referenceText: undefined })
  })

  it('sends a saved card pair when both halves are present', () => {
    expect(
      resolveInlineAudioReference({
        cardReferenceAudioUrl: 'https://cdn.example.com/card.wav',
        cardSampleText: '  Card transcript  ',
        adHocReferenceUrl: 'https://cdn.example.com/adhoc.wav',
        adHocReferenceText: 'ad-hoc transcript',
      }),
    ).toEqual({
      referenceAudioUrl: 'https://cdn.example.com/card.wav',
      referenceText: 'Card transcript',
    })
  })

  it('falls back to the ad-hoc pair when the card lacks a clip', () => {
    expect(
      resolveInlineAudioReference({
        cardReferenceAudioUrl: null,
        cardSampleText: 'card text only',
        adHocReferenceUrl: 'https://cdn.example.com/adhoc.wav',
        adHocReferenceText: 'ad-hoc transcript',
      }),
    ).toEqual({
      referenceAudioUrl: 'https://cdn.example.com/adhoc.wav',
      referenceText: 'ad-hoc transcript',
    })
  })

  it('never emits half a pair from mixed sources', () => {
    // Card clip (no text) + ad-hoc text (no clip) must NOT cross-pair.
    expect(
      resolveInlineAudioReference({
        cardReferenceAudioUrl: 'https://cdn.example.com/card.wav',
        cardSampleText: null,
        adHocReferenceUrl: null,
        adHocReferenceText: 'orphan transcript',
      }),
    ).toEqual({ referenceAudioUrl: undefined, referenceText: undefined })
  })

  it('returns an empty pair when nothing is provided', () => {
    expect(resolveInlineAudioReference({})).toEqual({
      referenceAudioUrl: undefined,
      referenceText: undefined,
    })
  })
})
