import { afterEach, describe, expect, it, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'

vi.mock('server-only', () => ({}))

import { runwayAdapter } from './runway.adapter'

afterEach(() => vi.unstubAllGlobals())

const RUNWAY_INPUT = {
  prompt: 'a cinematic city street at night',
  modelId: AI_MODELS.RUNWAY_GEN45,
  aspectRatio: '16:9' as const,
  providerConfig: { label: 'Runway', baseUrl: AI_PROVIDER_ENDPOINTS.RUNWAY },
  apiKey: 'runway-test-key',
  duration: 5,
}

describe('runwayAdapter video queue', () => {
  it('submits Gen-4.5 image-to-video using the current Runway API schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: '17f20503-6c24-4c16-946b-35dbbce2af2f' }),
        {
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await runwayAdapter.submitVideoToQueue!({
      ...RUNWAY_INPUT,
      referenceImage: 'https://cdn.example.com/source.png',
    })

    expect(result.requestId).toBe('17f20503-6c24-4c16-946b-35dbbce2af2f')
    expect(result.statusUrl).toBe(
      'https://api.dev.runwayml.com/v1/tasks/17f20503-6c24-4c16-946b-35dbbce2af2f',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/image_to_video',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer runway-test-key',
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06',
        },
      }),
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({
      model: 'gen4.5',
      promptText: 'a cinematic city street at night',
      promptImage: 'https://cdn.example.com/source.png',
      ratio: '1280:720',
      duration: 5,
    })
  })

  it('submits Gen-4.5 text-to-video without promptImage when no reference is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: '17f20503-6c24-4c16-946b-35dbbce2af2f' }),
        {
          status: 200,
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await runwayAdapter.submitVideoToQueue!(RUNWAY_INPUT)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/image_to_video',
      expect.objectContaining({ method: 'POST' }),
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({
      model: 'gen4.5',
      promptText: 'a cinematic city street at night',
      ratio: '1280:720',
      duration: 5,
    })
  })

  it('requires a reference image for Gen-4 Turbo', async () => {
    await expect(
      runwayAdapter.submitVideoToQueue!({
        ...RUNWAY_INPUT,
        modelId: AI_MODELS.RUNWAY_GEN4_TURBO,
      }),
    ).rejects.toThrow('requires a reference image')
  })

  it('maps task status responses to provider queue statuses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '17f20503-6c24-4c16-946b-35dbbce2af2f',
          status: 'SUCCEEDED',
          output: ['https://cdn.runwayml.com/output.mp4'],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await runwayAdapter.checkVideoQueueStatus!({
      statusUrl:
        'https://api.dev.runwayml.com/v1/tasks/17f20503-6c24-4c16-946b-35dbbce2af2f',
      responseUrl:
        'https://api.dev.runwayml.com/v1/tasks/17f20503-6c24-4c16-946b-35dbbce2af2f?width=1280&height=720&duration=5',
      apiKey: 'runway-test-key',
    })

    expect(result).toEqual({
      status: 'COMPLETED',
      result: {
        videoUrl: 'https://cdn.runwayml.com/output.mp4',
        width: 1280,
        height: 720,
        duration: 5,
        requestCount: 1,
      },
    })
  })
})
