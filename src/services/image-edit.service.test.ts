import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ProviderError } from '@/services/providers/types'

import {
  inpaintImage,
  outpaintImage,
  removeBackground,
  upscaleImage,
} from './image-edit.service'

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

  it('inpaints images with the fal fill endpoint', async () => {
    mockFetchJson({
      images: [
        {
          url: 'https://cdn.example.com/inpainted.png',
          width: 1024,
          height: 1024,
        },
      ],
    })

    const result = await inpaintImage({
      imageUrl: 'https://example.com/source.png',
      maskImageUrl: 'data:image/png;base64,mask',
      prompt: 'replace with flowers',
      negativePrompt: 'blur',
      apiKey: 'key',
    })

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/inpainted.png',
      width: 1024,
      height: 1024,
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://fal.run/fal-ai/flux-pro/v1/fill',
      expect.objectContaining({
        body: JSON.stringify({
          image_url: 'https://example.com/source.png',
          mask_url: 'data:image/png;base64,mask',
          prompt: 'replace with flowers',
          negative_prompt: 'blur',
        }),
      }),
    )
  })

  it('keeps inpaint provider failures classified as ProviderError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad mask'),
    })

    await expect(
      inpaintImage({
        imageUrl: 'https://example.com/source.png',
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'replace with flowers',
        apiKey: 'key',
      }),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('outpaints images with directional padding', async () => {
    mockFetchJson({
      images: [
        {
          url: 'https://cdn.example.com/outpainted.png',
          width: 1408,
          height: 1152,
        },
      ],
    })

    const result = await outpaintImage({
      imageUrl: 'https://example.com/source.png',
      padding: { top: 64, right: 128, bottom: 32, left: 16 },
      prompt: 'extend the landscape',
      apiKey: 'key',
    })

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/outpainted.png',
      width: 1408,
      height: 1152,
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://fal.run/fal-ai/image-apps-v2/outpaint',
      expect.objectContaining({
        body: JSON.stringify({
          image_url: 'https://example.com/source.png',
          expand_top: 64,
          expand_right: 128,
          expand_bottom: 32,
          expand_left: 16,
          prompt: 'extend the landscape',
          num_images: 1,
          output_format: 'png',
          sync_mode: true,
        }),
      }),
    )
  })

  it('passes zero padding through outpaint unchanged', async () => {
    mockFetchJson({
      images: [
        {
          url: 'https://cdn.example.com/outpainted.png',
          width: 1024,
          height: 1024,
        },
      ],
    })

    await outpaintImage({
      imageUrl: 'https://example.com/source.png',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      prompt: 'keep the image',
      apiKey: 'key',
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://fal.run/fal-ai/image-apps-v2/outpaint',
      expect.objectContaining({
        body: JSON.stringify({
          image_url: 'https://example.com/source.png',
          expand_top: 0,
          expand_right: 0,
          expand_bottom: 0,
          expand_left: 0,
          prompt: 'keep the image',
          num_images: 1,
          output_format: 'png',
          sync_mode: true,
        }),
      }),
    )
  })
})
