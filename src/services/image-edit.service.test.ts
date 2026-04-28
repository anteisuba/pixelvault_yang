import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProviderError } from '@/services/providers/types'

import { removeBackground, upscaleImage } from './image-edit.service'

function mockFetchJson(body: unknown): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  })
}

describe('image-edit.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes fal upscale responses through the schema', async () => {
    mockFetchJson({
      image: {
        url: 'https://cdn.example.com/upscaled.png',
        width: 2048,
        height: 2048,
      },
    })

    const result = await upscaleImage('https://example.com/source.png', 'key')

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/upscaled.png',
      width: 2048,
      height: 2048,
    })
  })

  it('normalizes fal background-removal responses through the schema', async () => {
    mockFetchJson({
      image: {
        url: 'https://cdn.example.com/cutout.png',
        width: 1024,
        height: 768,
      },
    })

    const result = await removeBackground(
      'https://example.com/source.png',
      'key',
    )

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/cutout.png',
      width: 1024,
      height: 768,
    })
  })

  it('rejects malformed provider responses instead of trusting a cast', async () => {
    mockFetchJson({ image: { url: 'not-a-url', width: 0, height: 768 } })

    await expect(
      upscaleImage('https://example.com/source.png', 'key'),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('keeps provider HTTP failures classified as ProviderError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    })

    await expect(
      removeBackground('https://example.com/source.png', 'key'),
    ).rejects.toBeInstanceOf(ProviderError)
  })
})
