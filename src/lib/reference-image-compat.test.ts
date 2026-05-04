import { describe, expect, it } from 'vitest'

import { normalizeReferenceImages } from '@/lib/reference-image-compat'

describe('normalizeReferenceImages', () => {
  it('returns an empty array for null input', () => {
    expect(normalizeReferenceImages(null)).toEqual([])
  })

  it('maps a single referenceImageUrl string to an identity ReferenceAsset entry', () => {
    expect(
      normalizeReferenceImages('https://example.com/reference.png'),
    ).toEqual([
      {
        url: 'https://example.com/reference.png',
        role: 'identity',
      },
    ])
  })

  it('maps legacy string arrays to identity ReferenceAsset entries', () => {
    expect(
      normalizeReferenceImages(['https://example.com/reference.png']),
    ).toEqual([
      {
        url: 'https://example.com/reference.png',
        role: 'identity',
      },
    ])
  })

  it('passes through valid new ReferenceAsset arrays', () => {
    const assets = [
      {
        url: 'https://example.com/style.png',
        role: 'style' as const,
        weight: 0.8,
      },
    ]

    expect(normalizeReferenceImages(assets)).toEqual(assets)
  })

  it('passes through snapshot.referenceAssets entries', () => {
    const snapshot = {
      referenceAssets: [
        {
          url: 'https://example.com/pose.png',
          role: 'pose' as const,
          notes: 'Use only the posture',
        },
      ],
    }

    expect(normalizeReferenceImages(snapshot.referenceAssets)).toEqual(
      snapshot.referenceAssets,
    )
  })

  it('returns an empty array for invalid input', () => {
    expect(
      normalizeReferenceImages([{ url: 'not-a-url', role: 'style' }]),
    ).toEqual([])
  })
})
