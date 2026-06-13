import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'

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

function mockFalImageQueue(
  fetchMock: ReturnType<typeof vi.fn>,
  requestId: string,
  imageUrl = 'https://fal.run/output/img.png',
) {
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          request_id: requestId,
          status_url: `https://queue.fal.run/status/${requestId}`,
          response_url: `https://queue.fal.run/result/${requestId}`,
        }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'COMPLETED' }), {
        status: 200,
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images: [
            {
              url: imageUrl,
              width: 1024,
              height: 1024,
            },
          ],
        }),
        { status: 200 },
      ),
    )
}

describe('falAdapter.generateImage', () => {
  it('returns an image URL from a successful queue response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: 'req-image-abc',
            status_url: 'https://queue.fal.run/status/req-image-abc',
            response_url: 'https://queue.fal.run/result/req-image-abc',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'COMPLETED' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
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
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.generateImage(BASE_INPUT)

    expect(result.imageUrl).toBe('https://fal.run/output/img.png')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toBe(
      `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/fal-ai/flux-2-pro`,
    )
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.prompt).toBe(BASE_INPUT.prompt)
  })

  // Removed: 'routes Anima LoRA generation through the Qwen Image LoRA endpoint'
  // The qwen-image route was reverted (architecture mismatch — Anima is SDXL,
  // Qwen is MMDiT). ANIMA_PENCIL_XL stays disabled until a real anime
  // checkpoint endpoint is identified; the Civitai LoRA library routes Anima
  // baseModel LoRAs to "open in Civitai" instead.

  it('does not send reference images to the text-to-image FLUX LoRA endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: 'req-flux-lora',
            status_url: 'https://queue.fal.run/status/req-flux-lora',
            response_url: 'https://queue.fal.run/result/req-flux-lora',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'COMPLETED' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            images: [
              {
                url: 'https://fal.run/output/flux-lora.png',
                width: 1024,
                height: 1024,
              },
            ],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await falAdapter.generateImage({
      ...BASE_INPUT,
      modelId: AI_MODELS.FLUX_LORA,
      referenceImages: ['https://cdn.example.com/reference.png'],
      advancedParams: {
        loras: [
          {
            url: 'https://example.com/lora.safetensors',
            scale: 1,
          },
        ],
      },
    })

    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toBe(
      `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/fal-ai/flux-lora`,
    )
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.image_url).toBeUndefined()
    expect(body.image_urls).toBeUndefined()
    expect(body.loras).toEqual([
      {
        path: 'https://example.com/lora.safetensors',
        scale: 1,
      },
    ])
  })

  it.each([
    [AI_MODELS.FLUX_2_PRO, 'fal-ai/flux-2-pro'],
    [AI_MODELS.SEEDREAM_45, 'fal-ai/bytedance/seedream/v4.5/text-to-image'],
    [AI_MODELS.FLUX_2_DEV, 'fal-ai/flux-2'],
    [AI_MODELS.FLUX_2_SCHNELL, 'fal-ai/flux/schnell'],
    [AI_MODELS.FLUX_2_MAX, 'fal-ai/flux-2-max'],
    [AI_MODELS.RECRAFT_V4_PRO, 'fal-ai/recraft/v4/pro/text-to-image'],
  ])(
    'does not send reference images to FAL text-to-image endpoint %s',
    async (modelId, externalModelId) => {
      const fetchMock = vi.fn()
      mockFalImageQueue(fetchMock, `req-${modelId}`)
      vi.stubGlobal('fetch', fetchMock)

      await falAdapter.generateImage({
        ...BASE_INPUT,
        modelId,
        referenceImages: [
          'https://cdn.example.com/a.png',
          'https://cdn.example.com/b.png',
        ],
      })

      const [endpoint, init] = fetchMock.mock.calls[0]
      expect(String(endpoint)).toBe(
        `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}`,
      )
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.image_url).toBeUndefined()
      expect(body.image_urls).toBeUndefined()
      expect(body.strength).toBeUndefined()
    },
  )

  it('sends Ideogram style references through image_urls', async () => {
    const fetchMock = vi.fn()
    mockFalImageQueue(fetchMock, 'req-ideogram')
    vi.stubGlobal('fetch', fetchMock)

    await falAdapter.generateImage({
      ...BASE_INPUT,
      modelId: AI_MODELS.IDEOGRAM_3,
      referenceImages: [
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/b.png',
        'https://cdn.example.com/c.png',
        'https://cdn.example.com/d.png',
      ],
      advancedParams: { referenceStrength: 0.9 },
    })

    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toBe(
      `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/fal-ai/ideogram/v3`,
    )
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.image_urls).toEqual([
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/b.png',
      'https://cdn.example.com/c.png',
    ])
    expect(body.image_url).toBeUndefined()
    expect(body.strength).toBeUndefined()
  })

  it('throws ProviderError with content_filtered code on policy error', async () => {
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

    await expect(falAdapter.generateImage(BASE_INPUT)).rejects.toMatchObject({
      message: 'Policy violated',
      errorCode: 'content_filtered',
    })
  })

  it('surfaces queue phase when a request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(
          new DOMException(
            'The operation was aborted due to timeout',
            'TimeoutError',
          ),
        ),
    )

    await expect(falAdapter.generateImage(BASE_INPUT)).rejects.toThrow(
      'queue submit request timed out',
    )
  })

  it('rejects safety-flagged image results instead of returning black placeholders', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: 'req-image-nsfw',
            status_url: 'https://queue.fal.run/status/req-image-nsfw',
            response_url: 'https://queue.fal.run/result/req-image-nsfw',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'COMPLETED' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            images: [
              {
                url: 'https://fal.run/output/black.png',
                width: 1024,
                height: 1024,
              },
            ],
            has_nsfw_concepts: [true],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(falAdapter.generateImage(BASE_INPUT)).rejects.toMatchObject({
      message: 'fal.ai returned has_nsfw_concepts for generated image.',
      errorCode: 'content_filtered',
    })
  })
})

describe('falAdapter F5-TTS queue', () => {
  it('submits F5-TTS with reference audio and returns queue handles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'req-audio-abc',
          status_url: 'https://queue.fal.run/status/req-audio-abc',
          response_url: 'https://queue.fal.run/result/req-audio-abc',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.submitAudioToQueue!({
      prompt: 'Say hello',
      modelId: 'fal-f5-tts',
      providerConfig: { label: 'fal.ai', baseUrl: AI_PROVIDER_ENDPOINTS.FAL },
      apiKey: 'fal-test-key',
      referenceAudioUrl: 'https://cdn.example.com/reference.wav',
      referenceText: 'Reference voice',
    })

    expect(result.requestId).toBe('req-audio-abc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toBe(
      `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/fal-ai/f5-tts`,
    )
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      gen_text: 'Say hello',
      ref_audio_url: 'https://cdn.example.com/reference.wav',
      ref_text: 'Reference voice',
      model_type: 'F5-TTS',
      remove_silence: true,
    })
  })

  it('maps completed F5-TTS queue results to ProviderAudioResult', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'COMPLETED' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            audio_url: {
              url: 'https://fal.media/audio.wav',
              content_type: 'audio/wav',
              file_name: 'audio.wav',
            },
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.checkAudioQueueStatus!({
      statusUrl: 'https://queue.fal.run/status/req-audio-abc',
      responseUrl: 'https://queue.fal.run/result/req-audio-abc',
      apiKey: 'fal-test-key',
    })

    expect(result).toEqual({
      status: 'COMPLETED',
      result: {
        audioUrl: 'https://fal.media/audio.wav',
        duration: 0,
        format: 'wav',
        sampleRate: 44100,
        requestCount: 1,
      },
    })
  })

  it('maps failed F5-TTS queue status to raw error and errorCode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'FAILED',
          error: {
            type: 'content_policy_violation',
            msg: 'Policy violated',
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.checkAudioQueueStatus!({
      statusUrl: 'https://queue.fal.run/status/req-audio-failed',
      responseUrl: 'https://queue.fal.run/result/req-audio-failed',
      apiKey: 'fal-test-key',
    })

    expect(result).toEqual({
      status: 'FAILED',
      error: 'Policy violated',
      errorCode: 'content_filtered',
    })
  })
})

describe('falAdapter image-to-3D queue', () => {
  const MODEL_3D_INPUT = {
    imageUrl: 'https://r2.example.com/source.png',
    modelId: 'hunyuan3d-2.1',
    providerConfig: { label: 'fal.ai', baseUrl: AI_PROVIDER_ENDPOINTS.FAL },
    apiKey: 'fal-test-key',
  }

  it('surfaces exhausted fal balance separately from invalid API keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail:
              'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
          }),
          { status: 403 },
        ),
      ),
    )

    await expect(
      falAdapter.submitModel3DToQueue!(MODEL_3D_INPUT),
    ).rejects.toMatchObject({
      message:
        'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
      errorCode: 'provider_insufficient_balance',
    })
  })

  it('maps failed 3D queue status to raw error and errorCode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'FAILED',
          error: {
            detail: [{ type: 'no_media_generated', msg: 'No mesh generated' }],
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.checkModel3DQueueStatus!({
      statusUrl: 'https://queue.fal.run/status/req-3d-failed',
      responseUrl: 'https://queue.fal.run/result/req-3d-failed',
      apiKey: 'fal-test-key',
    })

    expect(result).toEqual({
      status: 'FAILED',
      error: 'No mesh generated',
      errorCode: 'provider_no_output',
    })
  })

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

  it('submits Hunyuan3D v3 with side views, PBR, and face count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'req-hy3-v3',
          status_url: 'https://queue.fal.run/status/req-hy3-v3',
          response_url: 'https://queue.fal.run/result/req-hy3-v3',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await falAdapter.submitModel3DToQueue!({
      ...MODEL_3D_INPUT,
      modelId: 'hunyuan3d-v3',
      multiViewImages: {
        backImageUrl: 'https://r2.example.com/back.png',
        leftImageUrl: 'https://r2.example.com/left.png',
        rightImageUrl: 'https://r2.example.com/right.png',
      },
      enablePbr: true,
      faceCount: 1_000_000,
      generateType: 'Normal',
    })

    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toContain('fal-ai/hunyuan3d-v3/image-to-3d')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.input_image_url).toBe(MODEL_3D_INPUT.imageUrl)
    expect(body.back_image_url).toBe('https://r2.example.com/back.png')
    expect(body.left_image_url).toBe('https://r2.example.com/left.png')
    expect(body.right_image_url).toBe('https://r2.example.com/right.png')
    expect(body.enable_pbr).toBe(true)
    expect(body.face_count).toBe(1_000_000)
    expect(body.generate_type).toBe('Normal')
  })

  it('forwards all five multi-view angles to Hunyuan3D v3.1 Pro', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'req-hy31-5view',
          status_url: 'https://queue.fal.run/status/req-hy31-5view',
          response_url: 'https://queue.fal.run/result/req-hy31-5view',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await falAdapter.submitModel3DToQueue!({
      ...MODEL_3D_INPUT,
      modelId: 'hunyuan3d-v3.1-pro',
      multiViewImages: {
        backImageUrl: 'https://r2.example.com/back.png',
        leftImageUrl: 'https://r2.example.com/left.png',
        rightImageUrl: 'https://r2.example.com/right.png',
        leftFrontImageUrl: 'https://r2.example.com/left-front.png',
        rightFrontImageUrl: 'https://r2.example.com/right-front.png',
      },
      enablePbr: true,
      faceCount: 500_000,
      generateType: 'Normal',
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.back_image_url).toBe('https://r2.example.com/back.png')
    expect(body.left_image_url).toBe('https://r2.example.com/left.png')
    expect(body.right_image_url).toBe('https://r2.example.com/right.png')
    expect(body.left_front_image_url).toBe(
      'https://r2.example.com/left-front.png',
    )
    expect(body.right_front_image_url).toBe(
      'https://r2.example.com/right-front.png',
    )
  })

  it('submits Hunyuan3D v3.1 Pro geometry preview requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'req-hy31-geo',
          status_url: 'https://queue.fal.run/status/req-hy31-geo',
          response_url: 'https://queue.fal.run/result/req-hy31-geo',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await falAdapter.submitModel3DToQueue!({
      ...MODEL_3D_INPUT,
      modelId: 'hunyuan3d-v3.1-pro',
      enablePbr: false,
      faceCount: 1_000_000,
      generateType: 'Geometry',
    })

    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toContain('fal-ai/hunyuan-3d/v3.1/pro/image-to-3d')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.input_image_url).toBe(MODEL_3D_INPUT.imageUrl)
    expect(body.enable_pbr).toBe(false)
    expect(body.face_count).toBe(1_000_000)
    expect(body.generate_type).toBe('Geometry')
  })

  it('submits Trellis 2 detail controls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request_id: 'req-trellis-2',
          status_url: 'https://queue.fal.run/status/req-trellis-2',
          response_url: 'https://queue.fal.run/result/req-trellis-2',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await falAdapter.submitModel3DToQueue!({
      ...MODEL_3D_INPUT,
      modelId: 'trellis-2',
      trellisResolution: 1536,
      trellisTextureSize: 4096,
      trellisDecimationTarget: 1_000_000,
      trellisRemesh: true,
      trellisRemeshProject: 1,
      trellisStructureSamplingSteps: 24,
      trellisShapeSamplingSteps: 24,
      trellisTextureSamplingSteps: 24,
    })

    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toContain('fal-ai/trellis-2')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.image_url).toBe(MODEL_3D_INPUT.imageUrl)
    expect(body.resolution).toBe(1536)
    expect(body.texture_size).toBe(4096)
    expect(body.decimation_target).toBe(1_000_000)
    expect(body.remesh).toBe(true)
    expect(body.remesh_project).toBe(1)
    expect(body.ss_sampling_steps).toBe(24)
    expect(body.shape_slat_sampling_steps).toBe(24)
    expect(body.tex_slat_sampling_steps).toBe(24)
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

  it('returns FAILED when fal marks the 3D queue as failed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'FAILED',
          error: { message: 'provider failed' },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await falAdapter.checkModel3DQueueStatus!({
      statusUrl: 'https://queue.fal.run/status/req-3d-failed',
      responseUrl: 'https://queue.fal.run/result/req-3d-failed',
      apiKey: 'fal-test-key',
    })

    expect(result.status).toBe('FAILED')
  })

  it('throws a retryable provider error when 3D status fetch fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      falAdapter.checkModel3DQueueStatus!({
        statusUrl: 'https://queue.fal.run/status/req-3d-network',
        responseUrl: 'https://queue.fal.run/result/req-3d-network',
        apiKey: 'fal-test-key',
      }),
    ).rejects.toMatchObject({
      status: 502,
      detail: expect.stringContaining('[3D-status-fetch-error]'),
    })
  })

  it('returns COMPLETED with model_glb.url for Hunyuan3D v3 results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model_glb: {
              url: 'https://fal.run/output/model.glb',
              content_type: 'model/gltf-binary',
              file_name: 'model.glb',
              file_size: 7654321,
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
    expect(result.result?.modelUrl).toBe('https://fal.run/output/model.glb')
    expect(result.result?.contentType).toBe('model/gltf-binary')
    expect(result.result?.fileSize).toBe(7654321)
  })
})
