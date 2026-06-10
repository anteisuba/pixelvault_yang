import { describe, expect, it } from 'vitest'

import { loraThumbnailUrl } from './lora-thumbnail'

const CIVITAI_URL =
  'https://image.civitai.com/bucket/uuid/original=true/cover.jpeg'

describe('loraThumbnailUrl', () => {
  it('prefers coverImageUrl and rewrites Civitai URLs to the requested width', () => {
    const url = loraThumbnailUrl(
      {
        coverImageUrl: CIVITAI_URL,
        previewImageUrls: ['https://x.test/p.png'],
      },
      96,
    )
    expect(url).toContain('width=96')
    expect(url).toContain('image.civitai.com')
  })

  it('falls back to the first non-empty preview image', () => {
    const url = loraThumbnailUrl(
      { coverImageUrl: null, previewImageUrls: ['', 'https://x.test/p.png'] },
      96,
    )
    expect(url).toBe('https://x.test/p.png')
  })

  it('returns null when neither cover nor previews exist', () => {
    expect(
      loraThumbnailUrl({ coverImageUrl: null, previewImageUrls: [] }, 96),
    ).toBeNull()
  })

  it('survives legacy stack entries missing both fields entirely', () => {
    expect(loraThumbnailUrl({}, 96)).toBeNull()
    expect(
      loraThumbnailUrl({ previewImageUrls: null as unknown as string[] }, 96),
    ).toBeNull()
  })

  it('passes non-Civitai URLs through unchanged', () => {
    const url = loraThumbnailUrl(
      { coverImageUrl: 'https://r2.example.com/cover.png' },
      96,
    )
    expect(url).toBe('https://r2.example.com/cover.png')
  })
})
