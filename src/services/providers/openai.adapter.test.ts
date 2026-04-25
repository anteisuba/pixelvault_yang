import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
}))

import { openAiAdapter } from './openai.adapter'

afterEach(() => vi.unstubAllGlobals())

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
})
