import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
}))

import { geminiAdapter } from './gemini.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_INPUT = {
  prompt: 'a tropical island',
  modelId: 'gemini-3.1-flash-image-preview',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'Gemini', baseUrl: AI_PROVIDER_ENDPOINTS.GEMINI },
  apiKey: 'gemini-test-key',
}

describe('geminiAdapter.generateImage', () => {
  it('returns a data URL from a successful response', async () => {
    const fakeBase64 = Buffer.from('fake-image').toString('base64')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        data: fakeBase64,
                        mimeType: 'image/png',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await geminiAdapter.generateImage(BASE_INPUT)

    expect(result.imageUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('throws on error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 })),
    )

    await expect(geminiAdapter.generateImage(BASE_INPUT)).rejects.toThrow()
  })

  it('routes Gemini Pro Image to the current documented model ID', async () => {
    const fakeBase64 = Buffer.from('fake-image').toString('base64')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: fakeBase64,
                      mimeType: 'image/png',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await geminiAdapter.generateImage({
      ...BASE_INPUT,
      modelId: AI_MODELS.GEMINI_PRO_IMAGE,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${AI_PROVIDER_ENDPOINTS.GEMINI}/gemini-3-pro-image-preview:generateContent`,
      expect.any(Object),
    )
  })
})
