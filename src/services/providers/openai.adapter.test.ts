import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
}))

import { fetchAsBuffer } from '@/services/storage/r2'

import { openAiAdapter } from './openai.adapter'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const BASE_INPUT = {
  prompt: 'a futuristic city',
  modelId: 'dall-e-3',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'OpenAI', baseUrl: AI_PROVIDER_ENDPOINTS.OPENAI },
  apiKey: 'sk-test-key',
}

describe('openAiAdapter.generateImage', () => {
  it('returns an image URL from a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ url: 'https://openai.example.com/img.png' }],
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await openAiAdapter.generateImage(BASE_INPUT)

    expect(result.imageUrl).toBe('https://openai.example.com/img.png')
  })

  it('throws ProviderError on 401 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )

    await expect(openAiAdapter.generateImage(BASE_INPUT)).rejects.toThrow()
  })

  it('posts multiple reference images to the edits endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from('image').toString('base64') }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(fetchAsBuffer)
      .mockResolvedValueOnce({
        buffer: Buffer.from('first-reference'),
        mimeType: 'image/png',
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from('second-reference'),
        mimeType: 'image/webp',
      })

    await openAiAdapter.generateImage({
      ...BASE_INPUT,
      modelId: 'gpt-image-2',
      referenceImages: [
        'https://cdn.example.com/ref-1.png',
        'https://cdn.example.com/ref-2.webp',
      ],
    })

    expect(fetchAsBuffer).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${AI_PROVIDER_ENDPOINTS.OPENAI}/edits`)
    expect(init.method).toBe('POST')
    const formData = init.body as FormData
    expect(formData.get('image')).toBeNull()
    expect(formData.getAll('image[]')).toHaveLength(2)
    expect(formData.get('model')).toBe('gpt-image-2')
  })
})
