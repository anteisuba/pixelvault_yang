import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getImagePreviewUrl,
  getVideoFrameUrl,
  getVideoPosterUrl,
} from '@/lib/video-poster'

const CDN = 'https://cdn.test.com'

afterEach(() => {
  vi.unstubAllEnvs()
})

function withCdn(baseUrl: string = CDN) {
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', baseUrl)
}

describe('getVideoPosterUrl', () => {
  it('builds a Media Transformations frame URL for a CDN mp4', () => {
    withCdn()

    expect(getVideoPosterUrl(`${CDN}/generations/u1/clip.mp4`)).toBe(
      `${CDN}/cdn-cgi/media/mode=frame,time=1s,fit=scale-down,width=640,format=jpg/${CDN}/generations/u1/clip.mp4`,
    )
  })

  it('accepts webm and is case-insensitive about the extension', () => {
    withCdn()

    expect(getVideoPosterUrl(`${CDN}/clips/SHOT.WEBM`)).toContain('mode=frame')
  })

  it('keeps the transformation on our own zone even when the base URL has a path or trailing slash', () => {
    withCdn(`${CDN}/`)

    expect(getVideoPosterUrl(`${CDN}/clips/shot.mp4`)).toBe(
      `${CDN}/cdn-cgi/media/mode=frame,time=1s,fit=scale-down,width=640,format=jpg/${CDN}/clips/shot.mp4`,
    )
  })

  it('refuses foreign origins — transformations only accept same-zone sources', () => {
    withCdn()

    expect(getVideoPosterUrl('https://fal.media/files/tmp/clip.mp4')).toBeNull()
  })

  it('refuses containers Cloudflare does not decode', () => {
    withCdn()

    expect(getVideoPosterUrl(`${CDN}/clips/shot.mov`)).toBeNull()
    expect(getVideoPosterUrl(`${CDN}/images/frame.png`)).toBeNull()
  })

  it('returns null for empty, unparsable, or unconfigured input', () => {
    withCdn()
    expect(getVideoPosterUrl(null)).toBeNull()
    expect(getVideoPosterUrl(undefined)).toBeNull()
    expect(getVideoPosterUrl('')).toBeNull()
    expect(getVideoPosterUrl('/relative/clip.mp4')).toBeNull()

    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', '')
    expect(getVideoPosterUrl(`${CDN}/clips/shot.mp4`)).toBeNull()
  })
})

describe('getVideoFrameUrl', () => {
  it('writes the time as whole milliseconds at the requested width', () => {
    withCdn()

    expect(getVideoFrameUrl(`${CDN}/shots/a.mp4`, 2.5, 512)).toBe(
      `${CDN}/cdn-cgi/media/mode=frame,time=2500ms,fit=scale-down,width=512,format=jpg/${CDN}/shots/a.mp4`,
    )
    // 浮点尾巴不能生出第二个缓存键。
    expect(getVideoFrameUrl(`${CDN}/shots/a.mp4`, 0.1 + 0.2, 512)).toContain(
      'time=300ms',
    )
  })

  it('clamps a negative time to the first frame', () => {
    withCdn()
    expect(getVideoFrameUrl(`${CDN}/shots/a.mp4`, -1, 512)).toContain(
      'time=0ms',
    )
  })

  it('refuses the same sources the poster refuses', () => {
    withCdn()
    expect(getVideoFrameUrl('https://fal.media/a.mp4', 1, 512)).toBeNull()
    expect(getVideoFrameUrl(`${CDN}/shots/a.mov`, 1, 512)).toBeNull()
  })
})

describe('getImagePreviewUrl', () => {
  it('resizes a CDN image to a JPEG of the requested width', () => {
    withCdn()

    expect(getImagePreviewUrl(`${CDN}/images/a.png`, 512)).toBe(
      `${CDN}/cdn-cgi/image/width=512,fit=scale-down,format=jpeg/${CDN}/images/a.png`,
    )
  })

  it('refuses foreign origins', () => {
    withCdn()
    expect(getImagePreviewUrl('https://example.com/a.png', 512)).toBeNull()
  })
})
