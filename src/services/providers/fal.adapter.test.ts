import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { falAdapter } from './fal.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_INPUT = {
  prompt: 'a futuristic city skyline',
  modelId: 'flux-2-pro',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'fal.ai', baseUrl: AI_PROVIDER_ENDPOINTS.FAL },
  apiKey: 'fal-test-key',
}

describe('falAdapter.generateImage', () => {
  it('returns an image URL from a successful direct response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            images: [
              {
                url: 'https://fal.run/output/img.png',
                width: 1024,
                height: 1024,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await falAdapter.generateImage(BASE_INPUT)

    expect(result.imageUrl).toBe('https://fal.run/output/img.png')
  })

  it('throws ProviderError with content_policy_violation message on policy error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [
              { type: 'content_policy_violation', msg: 'Policy violated' },
            ],
          }),
          { status: 422 },
        ),
      ),
    )

    await expect(falAdapter.generateImage(BASE_INPUT)).rejects.toThrow(
      '内容审核',
    )
  })
})
