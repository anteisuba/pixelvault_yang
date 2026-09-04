import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'

import {
  getGenerationAudioSegments,
  getGenerationPreviewUrl,
  getGenerationThumbnailUrl,
  getGenerationVideoPosterUrl,
} from './generation-media'

const CDN = 'https://cdn.test.com'
const VIDEO = `${CDN}/generations/video/clip.mp4`

const ORIGINAL = 'https://r2.example.com/source.png'
const THUMBNAIL = 'https://r2.example.com/source.thumbnail.webp'
const PREVIEW = 'https://r2.example.com/source.preview.webp'

function makeGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    id: 'gen_media_001',
    createdAt: new Date('2026-08-07'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: ORIGINAL,
    storageKey: 'generations/image/source.png',
    mimeType: 'image/png',
    width: 2752,
    height: 1536,
    prompt: '',
    model: 'user-upload',
    provider: 'user-upload',
    requestCount: 1,
    isPublic: false,
    isPromptPublic: false,
    likeCount: 0,
    isLiked: false,
    ...overrides,
  }
}

describe('getGenerationPreviewUrl', () => {
  it('serves the untouched original when an upload has only a grid thumbnail', () => {
    // Every user upload lands here: `createImageThumbnailAsset` derives a
    // thumbnail and deliberately no preview. Falling back to that 384px tile
    // meant the detail view upscaled it ~3.5x and the pristine original in R2
    // was never shown anywhere.
    const generation = makeGeneration({ thumbnailUrl: THUMBNAIL })

    expect(getGenerationPreviewUrl(generation)).toBe(ORIGINAL)
  })

  it('prefers a real preview derivative over the original for images', () => {
    const generation = makeGeneration({
      thumbnailUrl: THUMBNAIL,
      previewUrl: PREVIEW,
    })

    expect(getGenerationPreviewUrl(generation)).toBe(PREVIEW)
  })

  it('keeps the poster fallback for media whose url is not a displayable image', () => {
    // A VIDEO/AUDIO `url` is an mp4/mp3 — the derivative is the only image
    // source there, so the thumbnail step must survive for non-image output.
    for (const outputType of ['VIDEO', 'AUDIO', 'MODEL_3D'] as const) {
      const generation = makeGeneration({ outputType, thumbnailUrl: THUMBNAIL })

      expect(getGenerationPreviewUrl(generation)).toBe(THUMBNAIL)
    }
  })

  it('falls back to the url when no derivative exists at all', () => {
    expect(getGenerationPreviewUrl(makeGeneration())).toBe(ORIGINAL)
  })
})

describe('getGenerationThumbnailUrl', () => {
  it('still prefers the small tile — grid tiles must not pull full originals', () => {
    const generation = makeGeneration({
      thumbnailUrl: THUMBNAIL,
      previewUrl: PREVIEW,
    })

    expect(getGenerationThumbnailUrl(generation)).toBe(THUMBNAIL)
  })

  it('degrades to preview, then to the original', () => {
    expect(
      getGenerationThumbnailUrl(makeGeneration({ previewUrl: PREVIEW })),
    ).toBe(PREVIEW)
    expect(getGenerationThumbnailUrl(makeGeneration())).toBe(ORIGINAL)
  })
})

describe('getGenerationVideoPosterUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers a derived thumbnail over the CDN frame extraction', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
    const generation = makeGeneration({
      outputType: 'VIDEO',
      url: VIDEO,
      thumbnailUrl: THUMBNAIL,
    })

    expect(getGenerationVideoPosterUrl(generation)).toBe(THUMBNAIL)
  })

  it('falls back to a Media Transformations frame when no derivative exists', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
    const poster = getGenerationVideoPosterUrl(
      makeGeneration({ outputType: 'VIDEO', url: VIDEO }),
    )

    expect(poster).toContain('/cdn-cgi/media/mode=frame')
    expect(poster).toContain(VIDEO)
  })

  it('never hands a video file to an image consumer', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', 'https://other.example.com')

    expect(
      getGenerationVideoPosterUrl(
        makeGeneration({ outputType: 'VIDEO', url: VIDEO }),
      ),
    ).toBeNull()
  })

  it('feeds the thumbnail chain for VIDEO records', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)

    expect(
      getGenerationThumbnailUrl(
        makeGeneration({ outputType: 'VIDEO', url: VIDEO }),
      ),
    ).toContain('/cdn-cgi/media/mode=frame')
  })
})

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
