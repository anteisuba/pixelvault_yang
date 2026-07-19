import { describe, expect, it } from 'vitest'

import { assembleReferenceImagePayload } from './node-reference-payload'

describe('assembleReferenceImagePayload', () => {
  it('drops falsy entries and preserves first-seen order', () => {
    expect(
      assembleReferenceImagePayload(
        [undefined, 'https://cdn/a.png', undefined, 'https://cdn/b.png'],
        9,
      ),
    ).toEqual({
      imageUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
      overflow: [],
    })
  })

  it('dedupes by URL, keeping the first occurrence position', () => {
    expect(
      assembleReferenceImagePayload(
        ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/a.png'],
        9,
      ),
    ).toEqual({
      imageUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
      overflow: [],
    })
  })

  it('truncates to the model cap after dedup', () => {
    expect(
      assembleReferenceImagePayload(
        ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png'],
        2,
      ),
    ).toEqual({
      imageUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
      overflow: [{ url: 'https://cdn/c.png' }],
    })
  })

  it('returns an empty array when the cap is zero, and every candidate as overflow', () => {
    expect(assembleReferenceImagePayload(['https://cdn/a.png'], 0)).toEqual({
      imageUrls: [],
      overflow: [{ url: 'https://cdn/a.png' }],
    })
  })

  it('returns an empty array for no sources', () => {
    expect(assembleReferenceImagePayload([], 9)).toEqual({
      imageUrls: [],
      overflow: [],
    })
  })

  // R3-6b §1: overflow entries stay in payload order and never overlap the
  // imageUrls they were cut from — a duplicate URL is deduped BEFORE the cap
  // applies, so it never shows up twice across the two arrays either.
  it('lists multiple overflow entries in order and dedupes before capping', () => {
    const result = assembleReferenceImagePayload(
      [
        'https://cdn/a.png',
        'https://cdn/b.png',
        'https://cdn/a.png',
        'https://cdn/c.png',
        'https://cdn/d.png',
      ],
      2,
    )
    expect(result.imageUrls).toEqual(['https://cdn/a.png', 'https://cdn/b.png'])
    expect(result.overflow).toEqual([
      { url: 'https://cdn/c.png' },
      { url: 'https://cdn/d.png' },
    ])
  })

  // Zero-drift snapshot for StudioNodeWorkbench's handleGenerateCharacterImage
  // call site (§1 抽取前后行为对照): existing-image-reference first, then the
  // card's own referenceAssets, in that priority order, capped to the model.
  it("matches handleGenerateCharacterImage's pre-extraction shape (existing + own referenceAssets, capped)", () => {
    const existingImageReference = 'https://cdn/existing.png'
    const referenceAssets = [
      { url: 'https://cdn/r1.png' },
      { url: 'https://cdn/r2.png' },
      { url: 'https://cdn/r3.png' },
    ]
    const maxReferenceImages = 2
    const result = assembleReferenceImagePayload(
      [
        existingImageReference,
        ...referenceAssets.map((reference) => reference.url),
      ],
      maxReferenceImages,
    )
    // Pre-extraction the same inputs produced, byte-for-byte:
    //   [existingImageReference, ...referenceAssets.map(r => r.url)].slice(0, max)
    expect(result.imageUrls).toEqual([
      'https://cdn/existing.png',
      'https://cdn/r1.png',
    ])
    expect(result.overflow).toEqual([
      { url: 'https://cdn/r2.png' },
      { url: 'https://cdn/r3.png' },
    ])
  })

  // Zero-drift snapshot for handleGenerateMediaNode's call site (§1): existing
  // image ref → own referenceAssets → upstream harvested URLs → upstream named
  // references, deduped in that priority order then capped — the exact source
  // order `pushReference` walked before extraction.
  it("matches handleGenerateMediaNode's pre-extraction shape (existing + own + upstream, deduped, capped)", () => {
    const existingImageReference = 'https://cdn/existing.png'
    const ownReferenceAssets = ['https://cdn/own1.png']
    const upstreamImageUrls = [
      'https://cdn/existing.png',
      'https://cdn/up1.png',
    ]
    const upstreamImageReferences = [
      { url: 'https://cdn/up1.png' },
      { url: 'https://cdn/up2.png' },
    ]
    const result = assembleReferenceImagePayload(
      [
        existingImageReference,
        ...ownReferenceAssets,
        ...upstreamImageUrls,
        ...upstreamImageReferences.map((reference) => reference.url),
      ],
      9,
    )
    expect(result.imageUrls).toEqual([
      'https://cdn/existing.png',
      'https://cdn/own1.png',
      'https://cdn/up1.png',
      'https://cdn/up2.png',
    ])
    expect(result.overflow).toEqual([])
  })
})
