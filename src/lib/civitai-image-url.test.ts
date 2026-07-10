import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  proxyCivitaiImageUrl,
  rewriteCivitaiImageUrl,
} from './civitai-image-url'

describe('rewriteCivitaiImageUrl', () => {
  const ORIGINAL =
    'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/original=true/1917130.jpeg'

  it('rewrites original=true segment to width+optimized (no anim by default)', () => {
    const out = rewriteCivitaiImageUrl(ORIGINAL, { width: 96 })
    expect(out).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=96,optimized=true/1917130.jpeg',
    )
  })

  it('rewrites existing width transform when present', () => {
    const input =
      'https://image.civitai.com/abc/uuid/width=450,optimized=true/file.jpg'
    const out = rewriteCivitaiImageUrl(input, { width: 96 })
    expect(out).toBe(
      'https://image.civitai.com/abc/uuid/width=96,optimized=true/file.jpg',
    )
  })

  it('honors optimized=false', () => {
    const out = rewriteCivitaiImageUrl(ORIGINAL, {
      width: 640,
      optimized: false,
    })
    expect(out).toContain('width=640')
    expect(out).not.toContain('optimized=true')
    expect(out).not.toContain('anim=false')
  })

  it('honors staticFrame=true (explicitly request static frame)', () => {
    const out = rewriteCivitaiImageUrl(ORIGINAL, {
      width: 640,
      staticFrame: true,
    })
    expect(out).toContain('anim=false')
    expect(out).toContain('width=640')
    expect(out).toContain('optimized=true')
  })

  it('passes through non-Civitai URLs untouched', () => {
    const input = 'https://cdn.example.com/foo/bar.jpg'
    expect(rewriteCivitaiImageUrl(input, { width: 96 })).toBe(input)
  })

  it('passes through R2 URLs (own uploads) untouched', () => {
    const input = 'https://pub-xyz.r2.dev/loras/cover/abc.jpg'
    expect(rewriteCivitaiImageUrl(input, { width: 96 })).toBe(input)
  })

  it('returns empty string for empty input', () => {
    expect(rewriteCivitaiImageUrl('', { width: 96 })).toBe('')
  })

  it('returns input unchanged for malformed URL', () => {
    expect(rewriteCivitaiImageUrl('not a url', { width: 96 })).toBe('not a url')
  })

  it('injects transform when no transform segment exists', () => {
    // Hypothetical non-standard URL — defensive path
    const input = 'https://image.civitai.com/bucket/uuid/file.jpg'
    const out = rewriteCivitaiImageUrl(input, { width: 96 })
    expect(out).toBe(
      'https://image.civitai.com/bucket/uuid/width=96,optimized=true/file.jpg',
    )
  })

  it('preserves query string and hash', () => {
    const input = `${ORIGINAL}?token=xyz#anchor`
    const out = rewriteCivitaiImageUrl(input, { width: 96 })
    expect(out).toContain('?token=xyz')
    expect(out).toContain('#anchor')
    expect(out).toContain('width=96')
  })
})

describe('proxyCivitaiImageUrl', () => {
  const CARD =
    'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=450,optimized=true/1917130.jpeg'

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('passes through unchanged when the proxy base is unset (fallback = direct)', () => {
    vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
    expect(proxyCivitaiImageUrl(CARD)).toBe(CARD)
  })

  it('rewrites the civitai host to the proxy base, keeping the full path', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE',
      'https://img.anteisuba.com',
    )
    expect(proxyCivitaiImageUrl(CARD)).toBe(
      'https://img.anteisuba.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=450,optimized=true/1917130.jpeg',
    )
  })

  it('tolerates a trailing slash on the proxy base', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE',
      'https://img.anteisuba.com/',
    )
    expect(proxyCivitaiImageUrl(CARD)).toBe(
      'https://img.anteisuba.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=450,optimized=true/1917130.jpeg',
    )
  })

  it('preserves the query string', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE',
      'https://img.anteisuba.com',
    )
    expect(proxyCivitaiImageUrl(`${CARD}?token=abc`)).toBe(
      'https://img.anteisuba.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=450,optimized=true/1917130.jpeg?token=abc',
    )
  })

  it('leaves non-civitai URLs (R2 / own uploads) untouched even when enabled', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE',
      'https://img.anteisuba.com',
    )
    const r2 = 'https://cdn.anteisuba.com/loras/cover/abc.jpg'
    expect(proxyCivitaiImageUrl(r2)).toBe(r2)
  })

  it('is idempotent — an already-proxied URL is returned unchanged', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE',
      'https://img.anteisuba.com',
    )
    const proxied = proxyCivitaiImageUrl(CARD)
    expect(proxyCivitaiImageUrl(proxied)).toBe(proxied)
  })

  it('returns empty string for empty input', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE',
      'https://img.anteisuba.com',
    )
    expect(proxyCivitaiImageUrl('')).toBe('')
  })

  it('returns input unchanged for malformed URL', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE',
      'https://img.anteisuba.com',
    )
    expect(proxyCivitaiImageUrl('not a url')).toBe('not a url')
  })
})
