import { describe, expect, it, vi, beforeEach } from 'vitest'

import { SafetyFilterError } from '@/lib/errors'
import { ProviderError } from '@/services/providers/types'

import {
  extractElement,
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

  // 1x1 transparent PNG. Tiny but a real decodable PNG so sharp can read
  // its metadata, which is what readBufferDimensions does at the end of the
  // Gemini path (and what we'd otherwise have to mock out).
  const TINY_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  it('routes GPT extract requests to the OpenAI /edits endpoint with a transparent-output prompt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    const result = await extractElement({
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      prompt: 'the red dress',
      apiKey: 'sk-test',
      modelId: 'gpt-image-2',
    })

    expect(result.imageUrl.startsWith('data:image/png;base64,')).toBe(true)
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('/edits')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-test',
    )
    // FormData body — verify the prompt the model receives carries the
    // transparent-background instruction (the whole point of routing here).
    const formData = init.body as FormData
    const prompt = formData.get('prompt') as string
    expect(prompt).toContain('the red dress')
    expect(prompt).toMatch(/transparent/i)
    expect(prompt).not.toMatch(/Remove only the/) // not the invert variant
  })

  it('flips the extract prompt when invert=true so the subject is removed instead', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    await extractElement({
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      prompt: 'person',
      apiKey: 'sk-test',
      modelId: 'gpt-image-2',
      invert: true,
    })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const formData = init.body as FormData
    const prompt = formData.get('prompt') as string
    // Inverse variant should describe keeping everything EXCEPT the subject —
    // exact phrasing is intentionally softer than "remove" to avoid tripping
    // OpenAI's image moderation. Just check the semantics, not the wording.
    expect(prompt).toMatch(
      /except the person|previously occupied by the person/i,
    )
    expect(prompt).toMatch(/transparent/i)
  })

  it('routes Gemini extract requests to generateContent with inlineData parts', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: TINY_PNG_BASE64,
                    },
                  },
                ],
              },
            },
          ],
        }),
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    const result = await extractElement({
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      prompt: 'hair',
      apiKey: 'gem-key',
      modelId: 'gemini-3-pro-image-preview',
    })

    expect(result.imageUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`)
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('gemini-3-pro-image-preview:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'gem-key',
    )
    const body = JSON.parse((init.body as string) ?? '{}') as {
      contents: Array<{ parts: unknown[] }>
    }
    expect(body.contents[0].parts.length).toBeGreaterThanOrEqual(2)
  })

  it('translates an OpenAI safety refusal into a SafetyFilterError, not a generic 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            error: {
              code: 'moderation_blocked',
              message: 'Content was filtered by the safety system.',
            },
          }),
        ),
    }) as unknown as typeof fetch

    await expect(
      extractElement({
        imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
        prompt: 'person',
        apiKey: 'sk-test',
        modelId: 'gpt-image-2',
      }),
    ).rejects.toBeInstanceOf(SafetyFilterError)
  })

  it('detects Gemini safety blocks even when the response is 200 OK with no image', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
        }),
    }) as unknown as typeof fetch

    await expect(
      extractElement({
        imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
        prompt: 'person',
        apiKey: 'gem-key',
        modelId: 'gemini-3-pro-image-preview',
      }),
    ).rejects.toBeInstanceOf(SafetyFilterError)
  })
})
