import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { huggingFaceAdapter } from './huggingface.adapter'

afterEach(() => {
  vi.unstubAllGlobals()
})

const BASE_INPUT = {
  prompt: 'a sunset over mountains',
  modelId: 'stabilityai/stable-diffusion-xl-base-1.0',
  aspectRatio: '1:1' as const,
  providerConfig: {
    label: 'HuggingFace',
    baseUrl: AI_PROVIDER_ENDPOINTS.HUGGINGFACE,
  },
  apiKey: 'hf-test-key',
}

describe('huggingFaceAdapter.generateImage', () => {
  it('sends Authorization header and returns base64 image URL', async () => {
    const imageBuffer = Buffer.from('fake-image-bytes')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from(imageBuffer), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await huggingFaceAdapter.generateImage(BASE_INPUT)

    expect(result.imageUrl).toMatch(/^data:image\/png;base64,/)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(AI_PROVIDER_ENDPOINTS.HUGGINGFACE),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer hf-test-key',
        }),
      }),
    )
  })

  it('throws ProviderError on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })),
    )

    await expect(huggingFaceAdapter.generateImage(BASE_INPUT)).rejects.toThrow(
      'HuggingFace',
    )
  })
})
