import { afterEach, describe, expect, it, vi } from 'vitest'

import { getVideoPosterUrl } from '@/lib/video-poster'

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
