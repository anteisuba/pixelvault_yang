import { afterEach, describe, expect, it, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { MODEL_OPTIONS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('server-only', () => ({}))

import { replicateAdapter } from './replicate.adapter'

const PROMPT = 'A precise cinematic prompt'
const API_KEY = 'r8-test-key'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('replicate video payloads', () => {
  it('has no source-of-truth Replicate video models in the current catalog', () => {
    const replicateVideoModels = MODEL_OPTIONS.filter(
      (model) =>
        model.adapterType === AI_ADAPTER_TYPES.REPLICATE &&
        model.outputType === 'VIDEO',
    )

    expect(replicateVideoModels).toEqual([])
  })

  it('keeps the generic direct video prediction body isolated to custom models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'prediction-id',
          status: 'succeeded',
          output: 'https://example.com/out.mp4',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await replicateAdapter.generateVideo?.({
      prompt: PROMPT,
      modelId: 'wan-video/wan-2.6-t2v',
      aspectRatio: '16:9',
      providerConfig: {
        label: 'Replicate',
        baseUrl: AI_PROVIDER_ENDPOINTS.REPLICATE,
      },
      apiKey: API_KEY,
      duration: 5,
    })

    const firstCall = fetchMock.mock.calls[0]
    const init = firstCall?.[1] as RequestInit | undefined

    expect(firstCall?.[0]).toBe(
      `${AI_PROVIDER_ENDPOINTS.REPLICATE}/predictions`,
    )
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'wan-video/wan-2.6-t2v',
      input: {
        prompt: PROMPT,
        aspect_ratio: '16:9',
        duration: 5,
      },
    })
  })
})
