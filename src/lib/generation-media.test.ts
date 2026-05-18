import { describe, expect, it } from 'vitest'

import { getGenerationAudioSegments } from './generation-media'

describe('getGenerationAudioSegments', () => {
  it('extracts valid Fish timestamp segments from the generation snapshot', () => {
    const segments = getGenerationAudioSegments({
      snapshot: {
        timestamps: [
          { text: '  Hello world  ', start: 0, end: 1.4 },
          { text: 'Ignored empty text', start: 2, end: 2 },
          { text: '', start: 3, end: 4 },
          { text: 'Second line', start: 1.4, end: 3.2 },
        ],
      },
    })

    expect(segments).toEqual([
      { text: 'Hello world', start: 0, end: 1.4 },
      { text: 'Second line', start: 1.4, end: 3.2 },
    ])
  })

  it('accepts legacy segment-shaped snapshots and ignores malformed entries', () => {
    const segments = getGenerationAudioSegments({
      snapshot: {
        segments: [
          { text: 'Narration', start: 0.2, end: 1.8 },
          { text: 'bad start', start: '0', end: 1 },
          { text: 'bad end', start: 2, end: Number.NaN },
        ],
      },
    })

    expect(segments).toEqual([{ text: 'Narration', start: 0.2, end: 1.8 }])
  })

  it('returns an empty list for snapshots without usable audio timing data', () => {
    expect(getGenerationAudioSegments(null)).toEqual([])
    expect(getGenerationAudioSegments({ snapshot: null })).toEqual([])
    expect(
      getGenerationAudioSegments({ snapshot: { timestamps: {} } }),
    ).toEqual([])
  })
})
