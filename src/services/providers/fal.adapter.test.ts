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

describe('falAdapter image-to-3D queue', () => {
  const MODEL_3D_INPUT = {
    imageUrl: 'https://r2.example.com/source.png',
    modelId: 'hunyuan3d-2.1',
    providerConfig: { label: 'fal.ai', baseUrl: AI_PROVIDER_ENDPOINTS.FAL },
    apiKey: 'fal-test-key',
  }

  it('submits with input_image_url for Hunyuan3D and returns queue handles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'req-3d-abc',
          status_url: 'https://queue.fal.run/status/req-3d-abc',
          response_url: 'https://queue.fal.run/result/req-3d-abc',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.submitModel3DToQueue!({
      ...MODEL_3D_INPUT,
      texturedMesh: true,
      octreeResolution: 512,
    })

    expect(result.requestId).toBe('req-3d-abc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toContain('fal-ai/hunyuan3d/v2')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.input_image_url).toBe(MODEL_3D_INPUT.imageUrl)
    expect(body.textured_mesh).toBe(true)
    expect(body.octree_resolution).toBe(512)
  })

  it('submits with image_url for TripoSR (no input_image_url)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'req-triposr-xyz',
          status_url: 'https://queue.fal.run/status/req-triposr-xyz',
          response_url: 'https://queue.fal.run/result/req-triposr-xyz',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await falAdapter.submitModel3DToQueue!({
      ...MODEL_3D_INPUT,
      modelId: 'triposr',
      removeBackground: false,
    })

    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toContain('fal-ai/triposr')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.image_url).toBe(MODEL_3D_INPUT.imageUrl)
    expect(body.input_image_url).toBeUndefined()
    expect(body.do_remove_background).toBe(false)
  })

  it('returns COMPLETED with model_mesh.url after queue finishes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model_mesh: {
              url: 'https://fal.run/output/mesh.glb',
              content_type: 'application/octet-stream',
              file_name: 'mesh.glb',
              file_size: 1234567,
            },
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.checkModel3DQueueStatus!({
      statusUrl: 'https://queue.fal.run/status/req-3d-abc',
      responseUrl: 'https://queue.fal.run/result/req-3d-abc',
      apiKey: 'fal-test-key',
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.result?.modelUrl).toBe('https://fal.run/output/mesh.glb')
    expect(result.result?.fileSize).toBe(1234567)
  })
})
