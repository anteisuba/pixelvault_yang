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

  it('returns a billing-safe message when Gemini is overloaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 503,
              message:
                'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
              status: 'UNAVAILABLE',
            },
          }),
          { status: 503 },
        ),
      ),
    )

    await expect(geminiAdapter.generateImage(BASE_INPUT)).rejects.toThrow(
      'The selected Gemini model is temporarily unavailable because Google is experiencing high demand. This is not an API key or billing error. Please try again later, or use Gemini 3.1 Flash Image for now.',
    )
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
      `${AI_PROVIDER_ENDPOINTS.GEMINI}/gemini-3-pro-image:generateContent`,
      expect.any(Object),
    )
  })
})

const VIDEO_INPUT = {
  prompt: 'a marble rolling down a track',
  modelId: AI_MODELS.GEMINI_OMNI_FLASH,
  aspectRatio: '16:9' as const,
  providerConfig: { label: 'Gemini', baseUrl: AI_PROVIDER_ENDPOINTS.GEMINI },
  apiKey: 'gemini-test-key',
}

const INTERACTION_ID = 'v1_abc123'
const STATUS_URL = `${AI_PROVIDER_ENDPOINTS.GEMINI_INTERACTIONS}/${INTERACTION_ID}`

function completedInteraction(videoContent: Record<string, unknown>) {
  return {
    id: INTERACTION_ID,
    status: 'completed',
    steps: [
      { type: 'user_input', content: [] },
      { type: 'model_output', content: [videoContent] },
    ],
  }
}

describe('geminiAdapter.submitVideoToQueue', () => {
  it('posts to the Interactions API and asks for uri delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: INTERACTION_ID, status: 'queued' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await geminiAdapter.submitVideoToQueue!(VIDEO_INPUT)

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe(AI_PROVIDER_ENDPOINTS.GEMINI_INTERACTIONS)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'gemini-test-key',
    )

    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('gemini-omni-flash-preview')
    expect(body.input).toEqual([
      { type: 'text', text: 'a marble rolling down a track' },
    ])
    expect(body.response_format).toEqual({
      type: 'video',
      aspect_ratio: '16:9',
      delivery: 'uri',
    })
    expect(body.video_config).toEqual({ task: 'text_to_video' })

    expect(result).toEqual({
      requestId: INTERACTION_ID,
      statusUrl: STATUS_URL,
      responseUrl: STATUS_URL,
    })
  })

  it('switches to image_to_video and inlines the reference frame', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: INTERACTION_ID, status: 'queued' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await geminiAdapter.submitVideoToQueue!({
      ...VIDEO_INPUT,
      referenceImage: 'data:image/png;base64,aGVsbG8=',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.video_config).toEqual({ task: 'image_to_video' })
    expect(body.input[1]).toEqual({
      type: 'image',
      mime_type: 'image/png',
      data: 'aGVsbG8=',
    })
  })

  it('collapses portrait ratios to 9:16', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: INTERACTION_ID, status: 'queued' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await geminiAdapter.submitVideoToQueue!({
      ...VIDEO_INPUT,
      aspectRatio: '3:4' as const,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).response_format.aspect_ratio).toBe(
      '9:16',
    )
  })
})

describe('geminiAdapter.checkVideoQueueStatus', () => {
  it('maps in_progress to IN_PROGRESS without touching the Files API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: INTERACTION_ID, status: 'in_progress' }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await geminiAdapter.checkVideoQueueStatus!({
      statusUrl: STATUS_URL,
      responseUrl: STATUS_URL,
      apiKey: 'gemini-test-key',
    })

    expect(result.status).toBe('IN_PROGRESS')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns an authenticated download URL once the file is ACTIVE', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            completedInteraction({
              type: 'video',
              mime_type: 'video/mp4',
              uri: 'https://generativelanguage.googleapis.com/v1beta/files/vid789',
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: 'files/vid789', state: 'ACTIVE' }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await geminiAdapter.checkVideoQueueStatus!({
      statusUrl: STATUS_URL,
      responseUrl: STATUS_URL,
      apiKey: 'gemini-test-key',
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.result?.videoUrl).toBe(
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/vid789:download?alt=media`,
    )
    expect(result.result?.fetchHeaders).toEqual({
      'x-goog-api-key': 'gemini-test-key',
    })
  })

  it('keeps polling while the file is still processing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            completedInteraction({
              type: 'video',
              uri: 'files/vid789',
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ name: 'files/vid789', state: 'PROCESSING' }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await geminiAdapter.checkVideoQueueStatus!({
      statusUrl: STATUS_URL,
      responseUrl: STATUS_URL,
      apiKey: 'gemini-test-key',
    })

    expect(result.status).toBe('IN_PROGRESS')
  })

  it('surfaces the provider message on a failed interaction', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: INTERACTION_ID,
            status: 'failed',
            error: { message: 'safety filter triggered' },
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await geminiAdapter.checkVideoQueueStatus!({
      statusUrl: STATUS_URL,
      responseUrl: STATUS_URL,
      apiKey: 'gemini-test-key',
    })

    expect(result.status).toBe('FAILED')
    expect(result.error).toBe('safety filter triggered')
  })

  it('throws when a completed interaction carries no video', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: INTERACTION_ID,
            status: 'completed',
            steps: [{ type: 'model_output', content: [{ type: 'text' }] }],
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(
      geminiAdapter.checkVideoQueueStatus!({
        statusUrl: STATUS_URL,
        responseUrl: STATUS_URL,
        apiKey: 'gemini-test-key',
      }),
    ).rejects.toThrow(/no video content/i)
  })
})
