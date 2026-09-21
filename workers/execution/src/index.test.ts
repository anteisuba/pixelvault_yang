import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CinematicShortVideoWorkflow,
  ImageQueueWorkflow,
  submitGeminiVideoQueue,
  pollGeminiVideoQueue,
  buildFalImageInput,
  bytesToBase64,
  cancelProviderJob,
  computeTieredDimensions,
  getImageReferenceInputs,
  createSignedRequestHeaders,
  decryptStateString,
  encryptStateString,
  generateNovelAiImage,
  generatePixAiImage,
  generateOpenAIImage,
  generateVolcEngineImage,
  hexToBytes,
  isCallbackKind,
  isImageResolutionTier,
  isLongVideoPipelineWorkflowId,
  isModel3DWorkflowId,
  isWorkerWorkflowId,
  parseCancelRequest,
  parseLongVideoPipelineRunContext,
  parseModel3DRunContext,
  parseWorkerRunContext,
  pollAndPersistRunnerImageJob,
  recycleRunnerEndpointWorkers,
  reportExecutionStage,
  reportProviderJobId,
  resolveFalImageModelId,
  submitFalImageQueue,
  submitFalLongVideoClipQueue,
  submitFalModel3DQueue,
  submitFalQueue,
  submitMiniMaxQueue,
  submitReplicateImagePrediction,
  submitRunnerImageJob,
  submitVolcEngineQueue,
  tieredGeminiDimensions,
  tieredOpenAISize,
  timingSafeEqualHex,
  toHex,
  verifySignedBody,
  volcEngine4KSize,
} from './index'
import executionWorker from './index'

afterEach(() => {
  vi.unstubAllGlobals()
})

type EncryptEnv = Parameters<typeof encryptStateString>[1]

describe('Gemini Omni video execution', () => {
  const fileUrl =
    'https://generativelanguage.googleapis.com/v1beta/files/video-1'
  function context() {
    return parseWorkerRunContext(
      makeVideoInput({
        providerId: 'gemini',
        providerInput: {
          externalModelId: 'gemini-omni-1.1-flash',
          referenceImages: ['data:image/png;base64,cmVm'],
          outputStorageKey: 'video/test.mp4',
          duration: 8,
        },
      }),
    )!
  }
  function interaction(uri = `${fileUrl}:download?alt=media`) {
    return {
      id: 'interaction-1',
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'video', uri }] }],
    }
  }
  it('submits image references through Interactions and persists only file metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(interaction()))
    vi.stubGlobal('fetch', fetchMock)
    const queue = await submitGeminiVideoQueue(
      context(),
      'test-key',
      {} as Parameters<typeof submitGeminiVideoQueue>[2],
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      model: 'gemini-omni-1.1-flash',
      background: false,
      store: false,
      input: [
        { type: 'image', mime_type: 'image/png', data: 'cmVm' },
        { type: 'text', text: 'a cat' },
      ],
      response_format: {
        type: 'video',
        delivery: 'uri',
        aspect_ratio: '16:9',
        resolution: '720p',
      },
    })
    expect(body).not.toHaveProperty('video_config')
    expect(queue).toEqual({
      requestId: 'interaction-1',
      statusUrl: fileUrl,
      responseUrl: `${fileUrl}:download?alt=media`,
    })
    expect(JSON.stringify(queue)).not.toContain('test-key')
  })
  it('rejects a foreign file URI before any authenticated download', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(interaction('https://example.com/v1beta/files/evil')),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      submitGeminiVideoQueue(
        context(),
        'test-key',
        {} as Parameters<typeof submitGeminiVideoQueue>[2],
      ),
    ).rejects.toThrow('invalid video file URI')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not treat a response with no video as a successful generation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ id: 'blocked', status: 'completed', steps: [] }),
        ),
    )
    await expect(
      submitGeminiVideoQueue(
        context(),
        'test-key',
        {} as Parameters<typeof submitGeminiVideoQueue>[2],
      ),
    ).rejects.toMatchObject({ errorCode: 'provider_no_output' })
  })
  it.each([
    ['PROCESSING', 'IN_PROGRESS'],
    ['FAILED', 'FAILED'],
    ['ACTIVE', 'COMPLETED'],
  ])('maps file state %s to %s', async (state, status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ state })))
    expect(
      await pollGeminiVideoQueue(
        {
          requestId: 'id',
          statusUrl: fileUrl,
          responseUrl: `${fileUrl}:download?alt=media`,
        },
        'test-key',
      ),
    ).toMatchObject({ status })
  })
  it.each([false, true])(
    'runs generation through R2 without persisting keys or forwarding them to media redirects (redirect: %s)',
    async (redirect) => {
      const put = vi.fn().mockResolvedValue(undefined)
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === 'https://resolve.example.com')
          return Response.json({ success: true, data: { apiKey: 'test-key' } })
        if (url === 'https://cb.example.com')
          return Response.json({ success: true })
        if (url.endsWith('/interactions')) return Response.json(interaction())
        if (url === fileUrl) return Response.json({ state: 'ACTIVE' })
        if (url === `${fileUrl}:download?alt=media`) {
          expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' })
          expect(init?.redirect).toBe('manual')
          if (redirect)
            return new Response(null, {
              status: 302,
              headers: { location: 'https://media.example.com/signed-video' },
            })
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'video/mp4' },
          })
        }
        if (url === 'https://media.example.com/signed-video') {
          expect(init?.headers).toBeUndefined()
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'video/mp4' },
          })
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })
      vi.stubGlobal('fetch', fetchMock)
      class TestWorkflow extends CinematicShortVideoWorkflow {
        setEnv(env: Parameters<typeof submitGeminiVideoQueue>[2]) {
          this.env = env
        }
      }
      const workflow = new TestWorkflow()
      workflow.setEnv({
        INTERNAL_CALLBACK_SECRET: 'test-secret',
        STATE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
        R2_PUBLIC_URL: 'https://cdn.example.com',
        GENERATION_BUCKET: { put },
      } as unknown as Parameters<typeof submitGeminiVideoQueue>[2])
      const stepResults: unknown[] = []
      const doStep = vi.fn(async (_name: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>
        const result = await callback()
        stepResults.push(result)
        return result
      })
      const result = await workflow.run(
        { payload: context(), instanceId: 'instance-1' } as Parameters<
          typeof workflow.run
        >[0],
        { do: doStep, sleep: vi.fn() } as unknown as Parameters<
          typeof workflow.run
        >[1],
      )
      expect(result).toMatchObject({ status: 'COMPLETED' })
      expect(put).toHaveBeenCalledWith(
        'video/test.mp4',
        expect.any(ArrayBuffer),
        { httpMetadata: { contentType: 'video/mp4' } },
      )
      const callbackBodies = fetchMock.mock.calls
        .filter(([url]) => url === 'https://cb.example.com')
        .map(([, init]) => JSON.parse(init!.body as string))
      expect(callbackBodies).toContainEqual(
        expect.objectContaining({
          kind: 'result',
          data: expect.objectContaining({
            videoR2Key: 'video/test.mp4',
            artifactUrl: 'https://cdn.example.com/video/test.mp4',
          }),
        }),
      )
      expect(
        callbackBodies.find((entry) => entry.kind === 'result').data,
      ).not.toHaveProperty('duration')
      expect(JSON.stringify(stepResults)).not.toContain('test-key')
      expect(
        doStep.mock.calls.find(([name]) => name === 'submit-provider')?.[1],
      ).toMatchObject({ retries: { limit: 0 } })
    },
  )
})

function makeVideoInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-1',
    workflowId: 'CINEMATIC_SHORT_VIDEO',
    outputType: 'VIDEO',
    providerId: 'fal',
    apiKeyId: 'key-1',
    callbackUrl: 'https://cb.example.com',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 60000,
    maxAttempts: 5,
    pollIntervalMs: 2000,
    ...overrides,
    providerInput: {
      prompt: 'a cat',
      modelId: 'model-1',
      externalModelId: 'ext-1',
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      ...(overrides.providerInput as Record<string, unknown> | undefined),
    },
  }
}

function makeAudioInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-2',
    workflowId: 'FAL_QUEUE',
    outputType: 'AUDIO',
    providerId: 'fal',
    useSystemKey: true,
    callbackUrl: 'https://cb.example.com',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 60000,
    maxAttempts: 5,
    pollIntervalMs: 2000,
    ...overrides,
    providerInput: {
      prompt: 'hello',
      modelId: 'model-2',
      externalModelId: 'ext-2',
      referenceAudioUrl: 'https://audio.example.com/ref.wav',
      ...(overrides.providerInput as Record<string, unknown> | undefined),
    },
  }
}

function makeLongVideoInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'r1',
    workflowId: 'LONG_VIDEO_PIPELINE',
    pipelineId: 'p1',
    advanceUrl: 'https://advance.example.com',
    providerId: 'fal',
    apiKeyId: 'k1',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 60000,
    maxAttempts: 5,
    pollIntervalMs: 2000,
    startClipIndex: 0,
    ...overrides,
    providerInput: {
      prompt: 'x',
      modelId: 'm',
      externalModelId: 'e',
      aspectRatio: '16:9',
      firstClipDuration: 5,
      extensionClipDuration: 5,
      totalClips: 2,
      extensionMethod: 'native_extend',
      outputStorageKeys: ['key-1', 'key-2'],
      width: 1280,
      height: 720,
      ...(overrides.providerInput as Record<string, unknown> | undefined),
    },
  }
}

function makeModel3DInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-3d',
    workflowId: 'HUNYUAN3D',
    outputType: 'MODEL_3D',
    providerId: 'fal',
    apiKeyId: 'key-3d',
    callbackUrl: 'https://cb.example.com',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 60000,
    maxAttempts: 5,
    pollIntervalMs: 2000,
    ...overrides,
    providerInput: {
      modelId: 'model-3d',
      externalModelId: 'ext-3d',
      imageUrl: 'https://images.example.com/ref.png',
      ...(overrides.providerInput as Record<string, unknown> | undefined),
    },
  }
}

function makeImageInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-image',
    workflowId: 'IMAGE_QUEUE',
    outputType: 'IMAGE',
    providerId: 'fal',
    apiKeyId: 'key-image',
    callbackUrl: 'https://cb.example.com',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 60000,
    maxAttempts: 5,
    pollIntervalMs: 2000,
    ...overrides,
    providerInput: {
      prompt: 'a lighthouse at dusk',
      modelId: 'flux-2-pro',
      externalModelId: 'fal-ai/flux-2-pro',
      aspectRatio: '1:1',
      ...(overrides.providerInput as Record<string, unknown> | undefined),
    },
  }
}

describe('workflow dispatch', () => {
  it('returns an existing image workflow when a retry reuses the run id', async () => {
    const secret = 'test-execution-secret'
    const body = JSON.stringify(makeImageInput())
    const url = 'https://execution.example.com/workflows/image-queue'
    const create = vi.fn().mockRejectedValue(new Error('instance id exists'))
    const get = vi.fn().mockResolvedValue({ id: 'run-image' })
    const request = new Request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await createSignedRequestHeaders({ secret, body, url })),
      },
      body,
    })

    const response = await executionWorker.fetch(request, {
      INTERNAL_CALLBACK_SECRET: secret,
      IMAGE_QUEUE_WORKFLOW: { create, get },
    } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      workflowInstanceId: 'run-image',
    })
    expect(get).toHaveBeenCalledWith('run-image')
  })
})

describe('type guards', () => {
  it('isCallbackKind accepts only the known kinds', () => {
    expect(isCallbackKind('ping')).toBe(true)
    expect(isCallbackKind('status')).toBe(true)
    expect(isCallbackKind('result')).toBe(true)
    expect(isCallbackKind('bogus')).toBe(false)
  })

  it('isWorkerWorkflowId accepts only the queue workflow ids', () => {
    expect(isWorkerWorkflowId('CINEMATIC_SHORT_VIDEO')).toBe(true)
    expect(isWorkerWorkflowId('FAL_QUEUE')).toBe(true)
    expect(isWorkerWorkflowId('LONG_VIDEO_PIPELINE')).toBe(false)
  })

  it('isLongVideoPipelineWorkflowId accepts only its own id', () => {
    expect(isLongVideoPipelineWorkflowId('LONG_VIDEO_PIPELINE')).toBe(true)
    expect(isLongVideoPipelineWorkflowId('FAL_QUEUE')).toBe(false)
  })

  it('isModel3DWorkflowId accepts Rodin and Hunyuan3D', () => {
    expect(isModel3DWorkflowId('HYPER3D_RODIN')).toBe(true)
    expect(isModel3DWorkflowId('HUNYUAN3D')).toBe(true)
    expect(isModel3DWorkflowId('FAL_QUEUE')).toBe(false)
  })
})

describe('parseWorkerRunContext', () => {
  it('parses a valid VIDEO run context', () => {
    const result = parseWorkerRunContext(makeVideoInput())
    expect(result).not.toBeNull()
    expect(result?.outputType).toBe('VIDEO')
    expect(result?.providerInput).toMatchObject({
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
    })
  })

  it('rejects a VIDEO context missing width/height', () => {
    const input = makeVideoInput()
    // @ts-expect-error deliberately dropping a required field for the test
    delete input.providerInput.width
    expect(parseWorkerRunContext(input)).toBeNull()
  })

  it('rejects an unknown workflowId', () => {
    expect(
      parseWorkerRunContext(makeVideoInput({ workflowId: 'NOT_A_WORKFLOW' })),
    ).toBeNull()
  })

  it('parses a valid AUDIO context for the fal provider', () => {
    const result = parseWorkerRunContext(makeAudioInput())
    expect(result).not.toBeNull()
    expect(result?.outputType).toBe('AUDIO')
  })

  it('rejects a fal AUDIO context missing referenceAudioUrl', () => {
    const input = makeAudioInput({
      providerInput: { referenceAudioUrl: undefined },
    })
    delete (input.providerInput as Record<string, unknown>).referenceAudioUrl
    expect(parseWorkerRunContext(input)).toBeNull()
  })

  it('parses a fish_audio AUDIO context with only a voiceId', () => {
    const input = makeAudioInput({
      providerId: 'fish_audio',
      providerInput: { referenceAudioUrl: undefined, voiceId: 'voice-1' },
    })
    delete (input.providerInput as Record<string, unknown>).referenceAudioUrl
    expect(parseWorkerRunContext(input)).not.toBeNull()
  })

  it('rejects a fish_audio AUDIO context with no voice binding at all', () => {
    const input = makeAudioInput({
      providerId: 'fish_audio',
      providerInput: { referenceAudioUrl: undefined },
    })
    delete (input.providerInput as Record<string, unknown>).referenceAudioUrl
    expect(parseWorkerRunContext(input)).toBeNull()
  })

  it('rejects an unrecognized outputType', () => {
    expect(
      parseWorkerRunContext(makeVideoInput({ outputType: 'TEXT' })),
    ).toBeNull()
  })
})

describe('parseLongVideoPipelineRunContext', () => {
  it('parses a valid pipeline context', () => {
    expect(
      parseLongVideoPipelineRunContext(makeLongVideoInput()),
    ).not.toBeNull()
  })

  it('rejects when outputStorageKeys is shorter than totalClips', () => {
    const input = makeLongVideoInput({
      providerInput: { outputStorageKeys: ['only-one'] },
    })
    expect(parseLongVideoPipelineRunContext(input)).toBeNull()
  })

  it('rejects an invalid extensionMethod', () => {
    const input = makeLongVideoInput({
      providerInput: { extensionMethod: 'not_a_method' },
    })
    expect(parseLongVideoPipelineRunContext(input)).toBeNull()
  })
})

describe('parseModel3DRunContext', () => {
  it('parses a valid HUNYUAN3D context with an imageUrl', () => {
    expect(parseModel3DRunContext(makeModel3DInput())).not.toBeNull()
  })

  it('rejects HUNYUAN3D without an imageUrl', () => {
    const input = makeModel3DInput({ providerInput: { imageUrl: undefined } })
    delete (input.providerInput as Record<string, unknown>).imageUrl
    expect(parseModel3DRunContext(input)).toBeNull()
  })

  it('parses HYPER3D_RODIN with only a prompt (no imageUrl)', () => {
    const input = makeModel3DInput({
      workflowId: 'HYPER3D_RODIN',
      providerInput: { imageUrl: undefined, prompt: 'a dragon statue' },
    })
    delete (input.providerInput as Record<string, unknown>).imageUrl
    expect(parseModel3DRunContext(input)).not.toBeNull()
  })

  it('rejects HYPER3D_RODIN with neither imageUrl nor prompt', () => {
    const input = makeModel3DInput({
      workflowId: 'HYPER3D_RODIN',
      providerInput: { imageUrl: undefined },
    })
    delete (input.providerInput as Record<string, unknown>).imageUrl
    expect(parseModel3DRunContext(input)).toBeNull()
  })
})

describe('pollAndPersistRunnerImageJob', () => {
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/r8AAAAASUVORK5CYII=',
    'base64',
  )
  function evidence() {
    return {
      version: 1,
      evidence: 'loader-output',
      imageSha256: createHash('sha256').update(imageBytes).digest('hex'),
      models: [
        {
          kind: 'checkpoint',
          filename: 'source.safetensors',
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
        },
        {
          kind: 'lora',
          filename: 'Sue.safetensors',
          sha256: 'b'.repeat(64),
          sizeBytes: 512,
          strengthModel: 0.9,
          strengthClip: 0.9,
        },
      ],
    }
  }
  function auditedPoll(runnerExecution: unknown) {
    const put = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          status: 'COMPLETED',
          output: {
            images: [{ data: imageBytes.toString('base64') }],
            runnerExecution,
          },
        }),
      ),
    )
    const env = {
      RUNPOD_ENDPOINT: 'runner-endpoint',
      R2_PUBLIC_URL: 'https://cdn.example.com',
      GENERATION_BUCKET: { put },
    } as unknown as Parameters<typeof pollAndPersistRunnerImageJob>[1]
    return {
      put,
      result: pollAndPersistRunnerImageJob(
        'runner-job-1',
        env,
        'runpod-key',
        'image/audited.png',
      ),
    }
  }

  it('propagates loader evidence only when its hash matches the uploaded image bytes', async () => {
    const runnerExecution = evidence()
    const { put, result } = auditedPoll(runnerExecution)
    expect(await result).toMatchObject({ status: 'COMPLETED', runnerExecution })
    expect(Buffer.from(put.mock.calls[0][1])).toEqual(imageBytes)
  })

  it('does not upload an image whose evidence hash belongs to different bytes', async () => {
    const { put, result } = auditedPoll({
      ...evidence(),
      imageSha256: '0'.repeat(64),
    })
    await expect(result).rejects.toThrow(/does not match image bytes/)
    expect(put).not.toHaveBeenCalled()
  })

  it('does not upload malformed model evidence', async () => {
    const data = evidence()
    data.models[0].sha256 = 'not-a-sha256'
    const { put, result } = auditedPoll(data)
    await expect(result).rejects.toThrow(/Invalid Runner model load evidence/)
    expect(put).not.toHaveBeenCalled()
  })
  it('stores completed Runner image bytes in R2 and returns only compact metadata', async () => {
    const imageBase64 = Buffer.alloc(1_100_000, 7).toString('base64')
    const put = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'COMPLETED',
            output: { images: [{ data: imageBase64 }] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const env = {
      RUNPOD_ENDPOINT: 'runner-endpoint',
      R2_PUBLIC_URL: 'https://cdn.example.com',
      GENERATION_BUCKET: { put },
    } as unknown as Parameters<typeof pollAndPersistRunnerImageJob>[1]

    const result = await pollAndPersistRunnerImageJob(
      'runner-job-1',
      env,
      'runpod-key',
      'image/run-1.png',
    )

    expect(result).toEqual({
      status: 'COMPLETED',
      artifactUrl: 'https://cdn.example.com/image/run-1.png',
      imageR2Key: 'image/run-1.png',
      mimeType: 'image/png',
    })
    expect(JSON.stringify(result).length).toBeLessThan(1024)
    expect(result).not.toHaveProperty('runnerExecution')
    expect(put).toHaveBeenCalledWith(
      'image/run-1.png',
      expect.any(Uint8Array),
      { httpMetadata: { contentType: 'image/png' } },
    )
    const uploadedBytes = put.mock.calls[0]?.[1] as Uint8Array
    expect(uploadedBytes.byteLength).toBe(1_100_000)
  })
})

/**
 * worker-contracts 补丁 —— 死执行链清理 Step 1（只加不删）。
 *
 * `generateNovelAiImage` 是 NovelAI 图片生成在 execution worker 里的真实现
 * （`context.providerId === 'novelai'` 时被 ImageQueueWorkflow.run 调用，见
 * index.ts 里 `generate-novelai-image` 那个 step.do）。为了能在这里直接单测它，
 * 给它加了一个 `export`（纯新增，零行为变化——和同文件里
 * `pollAndPersistRunnerImageJob` / `buildFalImageInput` 等已导出的纯函数走的
 * 是同一个既有约定）。
 *
 * 对照的是 `src/services/providers/novelai.adapter.ts`（d2c664bd 新增，
 * `src/services/providers/novelai.adapter.test.ts` 65 行新测试覆盖）里的三条
 * 语义：V5 模型 params_version 发 4、V5 不发 skip_cfg_above_sigma、V5 拒绝多图
 * 参考。src 侧那份 adapter 是死 fork（图片生成早已走 worker-only），这里断言的
 * 是 index.ts 里真正会跑的那份。
 */
describe('generateNovelAiImage', () => {
  const NOVELAI_V5_FULL = 'nai-diffusion-5-full'
  const NOVELAI_V45_FULL = 'nai-diffusion-4-5-full'

  /**
   * Builds a real ZIP archive (local header + central directory + EOCD),
   * optionally in NovelAI's actual shape: general-purpose bit 3 set and the
   * local header's sizes zeroed, with the true sizes only recoverable from
   * the central directory and a trailing data descriptor after the file
   * data. `extractNovelAiZipImage` must read sizes from the central
   * directory to handle this — see the fix note on that function.
   */
  function buildZip({
    fileName,
    fileData,
    compressedData,
    compressionMethod,
    streamedSizes,
  }: {
    fileName: string
    fileData: Uint8Array
    compressedData: Uint8Array
    compressionMethod: number
    streamedSizes: boolean
  }): ArrayBuffer {
    const fileNameBytes = new TextEncoder().encode(fileName)
    const generalPurposeFlag = streamedSizes ? 0x08 : 0

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(generalPurposeFlag, 6)
    localHeader.writeUInt16LE(compressionMethod, 8)
    localHeader.writeUInt32LE(0, 10)
    localHeader.writeUInt32LE(0, 14)
    localHeader.writeUInt32LE(streamedSizes ? 0 : compressedData.byteLength, 18)
    localHeader.writeUInt32LE(streamedSizes ? 0 : fileData.byteLength, 22)
    localHeader.writeUInt16LE(fileNameBytes.byteLength, 26)
    localHeader.writeUInt16LE(0, 28)

    const localSection = Buffer.concat([
      localHeader,
      Buffer.from(fileNameBytes),
      Buffer.from(compressedData),
    ])

    // Real NovelAI zips append a data descriptor after streamed entries —
    // included here so the extractor is proven not to depend on scanning
    // past it (the bug this replaces used to swallow these bytes).
    const dataDescriptor = Buffer.alloc(streamedSizes ? 12 : 0)
    if (streamedSizes) {
      dataDescriptor.writeUInt32LE(0, 0)
      dataDescriptor.writeUInt32LE(compressedData.byteLength, 4)
      dataDescriptor.writeUInt32LE(fileData.byteLength, 8)
    }

    const centralDirOffset = localSection.byteLength + dataDescriptor.byteLength

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(generalPurposeFlag, 8)
    centralHeader.writeUInt16LE(compressionMethod, 10)
    centralHeader.writeUInt32LE(0, 12)
    centralHeader.writeUInt32LE(0, 16)
    centralHeader.writeUInt32LE(compressedData.byteLength, 20)
    centralHeader.writeUInt32LE(fileData.byteLength, 24)
    centralHeader.writeUInt16LE(fileNameBytes.byteLength, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(0, 42)

    const centralSection = Buffer.concat([
      centralHeader,
      Buffer.from(fileNameBytes),
    ])

    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(1, 8)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(centralSection.byteLength, 12)
    eocd.writeUInt32LE(centralDirOffset, 16)
    eocd.writeUInt16LE(0, 20)

    const bytes = Buffer.concat([
      localSection,
      dataDescriptor,
      centralSection,
      eocd,
    ])
    const zip = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(zip).set(bytes)
    return zip
  }

  function createStoredZip(
    fileName: string,
    fileData: Uint8Array,
  ): ArrayBuffer {
    return buildZip({
      fileName,
      fileData,
      compressedData: fileData,
      compressionMethod: 0,
      streamedSizes: false,
    })
  }

  function stubNovelAiZipResponse() {
    const fakeZip = createStoredZip(
      'image.png',
      Uint8Array.from(Buffer.from('fake-novel-ai-image')),
    )
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakeZip, {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  function makeEnv() {
    return {
      GENERATION_BUCKET: { put: vi.fn().mockResolvedValue(undefined) },
      R2_PUBLIC_URL: 'https://cdn.example.com',
    } as unknown as Parameters<typeof generateNovelAiImage>[0]
  }

  function makeContext(externalModelId: string, referenceImages?: string[]) {
    return {
      runId: 'run-novelai-1',
      workflowId: 'IMAGE_QUEUE',
      outputType: 'IMAGE',
      providerId: 'novelai',
      callbackUrl: 'https://cb.example.com',
      resolveKeyUrl: 'https://resolve.example.com',
      timeoutMs: 60000,
      maxAttempts: 5,
      pollIntervalMs: 2000,
      providerInput: {
        prompt: 'masterpiece, best quality, 1girl, blue hair',
        modelId: externalModelId,
        externalModelId,
        aspectRatio: '1:1',
        referenceImages,
      },
    } as unknown as Parameters<typeof generateNovelAiImage>[1]
  }

  it('routes precise character reference as generation without img2img fields', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V45_FULL, [
      'https://example.com/ref.png',
    ])
    fetchMock.mockResolvedValueOnce(
      new Response(Uint8Array.from([137, 80, 78, 71])),
    )
    context.providerInput.advancedParams = {
      novelAiReferenceMode: 'precise',
      preciseReferenceStrength: 0.8,
      preciseReferenceFidelity: 0.4,
      referenceStrength: 0.9,
      img2imgNoise: 0.6,
      cfgRescale: 0.2,
    }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(body.action).toBe('generate')
    expect(body.parameters).toMatchObject({
      director_reference_images: ['iVBORw=='],
      director_reference_descriptions: [
        { caption: { base_caption: 'character', char_captions: [] } },
      ],
      director_reference_information_extracted: [1],
      director_reference_strength_values: [0.8],
      director_reference_secondary_strength_values: [0.4],
      cfg_rescale: 0.2,
    })
    expect(body.parameters.image).toBeUndefined()
    expect(body.parameters.strength).toBeUndefined()
    expect(body.parameters.noise).toBeUndefined()
  })

  it('sends noise and CFG rescale for ordinary img2img without precise-reference fields', async () => {
    const fetchMock = stubNovelAiZipResponse()
    fetchMock.mockResolvedValueOnce(
      new Response(Uint8Array.from([137, 80, 78, 71])),
    )
    const context = makeContext(NOVELAI_V5_FULL, [
      'https://example.com/ref.png',
    ])
    context.providerInput.advancedParams = {
      img2imgNoise: 0.3,
      cfgRescale: 0.25,
      referenceStrength: 0.8,
    }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(body.action).toBe('img2img')
    expect(body.parameters.noise).toBe(0.3)
    expect(body.parameters.cfg_rescale).toBe(0.25)
    expect(body.parameters.strength).toBeCloseTo(0.2)
    expect(body.parameters.director_reference_images).toBeUndefined()
  })

  it('rejects precise reference on V5 before fetching', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL, [
      'https://example.com/ref.png',
    ])
    context.providerInput.advancedParams = { novelAiReferenceMode: 'precise' }
    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('Precise character reference requires')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['manual', 'auto'])(
    'maps V5 character prompts with %s positioning',
    async (positioning) => {
      const fetchMock = stubNovelAiZipResponse()
      const context = makeContext(NOVELAI_V5_FULL)
      context.providerInput.advancedParams = {
        novelAiLayout: {
          positioning,
          characters: [
            {
              prompt: 'girl, blue hair',
              negativePrompt: 'hat',
              position: { x: 0.2, y: 0.7 },
            },
            {
              prompt: 'boy, red hair',
              negativePrompt: 'glasses',
              position: { x: 0.8, y: 0.4 },
            },
          ],
        },
      }
      await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
      const body = JSON.parse(
        String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
      )
      expect(body.parameters.v4_prompt).toMatchObject({
        use_coords: positioning === 'manual',
        use_order: true,
        caption: {
          char_captions: [
            { char_caption: 'girl, blue hair', centers: [{ x: 0.2, y: 0.7 }] },
            { char_caption: 'boy, red hair', centers: [{ x: 0.8, y: 0.4 }] },
          ],
        },
      })
      expect(body.parameters.v4_negative_prompt.caption.char_captions).toEqual([
        { char_caption: 'hat', centers: [{ x: 0.2, y: 0.7 }] },
        { char_caption: 'glasses', centers: [{ x: 0.8, y: 0.4 }] },
      ])
    },
  )

  it('rejects invalid V5 coordinates before making a request', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      novelAiLayout: {
        positioning: 'manual',
        characters: [
          { prompt: 'girl', negativePrompt: '', position: { x: 2, y: 0 } },
        ],
      },
    }
    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('Invalid NovelAI character layout')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends params_version 4 for V5 models', async () => {
    const fetchMock = stubNovelAiZipResponse()

    await generateNovelAiImage(
      makeEnv(),
      makeContext(NOVELAI_V5_FULL),
      'nai-test-key',
    )

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { model: string; parameters: Record<string, unknown> }
    expect(body.model).toBe(NOVELAI_V5_FULL)
    expect(body.parameters.params_version).toBe(4)
  })

  it('omits skip_cfg_above_sigma for V5 models', async () => {
    const fetchMock = stubNovelAiZipResponse()

    await generateNovelAiImage(
      makeEnv(),
      makeContext(NOVELAI_V5_FULL),
      'nai-test-key',
    )

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters).not.toHaveProperty('skip_cfg_above_sigma')
  })

  it('contrast: V4.5 still sends params_version 3 and keeps skip_cfg_above_sigma', async () => {
    // Not one of the three ported semantics, but proves the V5 assertions
    // above are exercising a real branch and not a constant.
    const fetchMock = stubNovelAiZipResponse()

    await generateNovelAiImage(
      makeEnv(),
      makeContext(NOVELAI_V45_FULL),
      'nai-test-key',
    )

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters.params_version).toBe(3)
    expect(body.parameters).toHaveProperty('skip_cfg_above_sigma')
  })

  it('rejects a V5 request carrying more than one reference image', async () => {
    // src's novelai.adapter.ts throws specifically for `hasMultiRef && useV5`
    // ('NovelAI V5 does not support multi-image Character Reference yet.'),
    // leaving V4/V4.5 multi-ref (Director mode) to go through
    // buildMultiRefParams. The worker's generateNovelAiImage rejects ANY
    // NovelAI model with more than one reference image
    // ('NovelAI multi-reference Director generation is not worker-migrated
    // yet.') — broader than src's V5-only rule, so this specific case still
    // throws, but for a different reason. See the drift note in the Step 1
    // report; not asserting the exact message here since the two forks
    // disagree on it.
    await expect(
      generateNovelAiImage(
        makeEnv(),
        makeContext(NOVELAI_V5_FULL, [
          'https://example.com/a.png',
          'https://example.com/b.png',
        ]),
        'nai-test-key',
      ),
    ).rejects.toThrow()
  })

  // 进度表 26 切片 1。三颗控件的字段对照都来自官方文档：质量标签与 UC 预设是
  // **标签串**（不是 API 字段），`Text:` 落在 prompt 最末。
  it('appends the V5 quality tag string and keeps Text: last', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      qualityToggle: 'standard',
      textRendering: 'Hello world',
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { input: string; parameters: Record<string, unknown> }
    const expected =
      'masterpiece, best quality, 1girl, blue hair, very aesthetic, masterpiece, no text, Text: Hello world'
    expect(body.parameters.prompt).toBe(expected)
    expect(body.input).toBe(expected)
    expect(
      (
        body.parameters.v4_prompt as {
          caption: { base_caption: string }
        }
      ).caption.base_caption,
    ).toBe(expected)
    // 质量标签不是 API 字段 —— payload 里那颗布尔保持关闭。
    expect(body.parameters.qualityToggle).toBe(false)
  })

  it.each([
    [
      'nai-diffusion-4-5-full',
      ', location, very aesthetic, masterpiece, no text',
    ],
    [
      'nai-diffusion-4-5-curated',
      ', location, masterpiece, no text, -0.8::feet::, rating:general',
    ],
  ])('uses model-specific quality tags for %s', async (model, suffix) => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(model)
    context.providerInput.advancedParams = { qualityToggle: 'standard' }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.input).toBe(context.providerInput.prompt + suffix)
    expect(body.parameters.v4_prompt.caption.base_caption).toBe(body.input)
    expect(body.parameters.qualityToggle).toBe(false)
  })

  it('leaves the prompt untouched on the default quality tag option', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = { qualityToggle: 'off' }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters.prompt).toBe(
      'masterpiece, best quality, 1girl, blue hair',
    )
  })

  it('prefixes the UC preset tags before the user negative prompt', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      ucPreset: 'light',
      negativePrompt: 'hat',
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters.negative_prompt).toBe(
      'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::, hat',
    )
    // 数字档没有官方口径，保持原样（V4/V5 的 None）。
    expect(body.parameters.ucPreset).toBe(4)
  })

  // 进度表 26 切片 2。NovelAI 的 infill 是换模型 + 换 action，不是加参数。
  it('switches to the inpainting model and infill action when a mask is set', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL, [
      'data:image/png;base64,c291cmNl',
    ])
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { model: string; action: string; parameters: Record<string, unknown> }
    expect(body.model).toBe('nai-diffusion-5-full-inpainting')
    expect(body.action).toBe('infill')
    expect(body.parameters.mask).toBe('bWFzaw==')
    expect(body.parameters.add_original_image).toBe(true)
  })

  it('falls back to the V4.5 Full inpainting model for V5 Curated', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext('nai-diffusion-5-curated', [
      'data:image/png;base64,c291cmNl',
    ])
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { model: string; action: string }
    expect(body.model).toBe('nai-diffusion-4-5-full-inpainting')
    expect(body.action).toBe('infill')
  })

  // 遮罩没有底图 = 没有可重绘的东西；⛔ 不能默默退回普通文生图。
  it('rejects a mask with no source image', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('NovelAI inpainting needs one source image')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a mask on a model with no inpainting counterpart', async () => {
    const context = makeContext(NOVELAI_V45_FULL, [
      'data:image/png;base64,c291cmNl',
    ])
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('NovelAI inpainting needs one source image')
  })

  it('extracts the image from a deflate-compressed, streamed-size ZIP (real NovelAI shape)', async () => {
    // Regression test: NovelAI's actual response is deflate-compressed
    // (method 8) with the local header's sizes zeroed (general-purpose bit
    // 3, "streamed"). The old extractor guessed the compressed length by
    // scanning forward for the next `PK` signature, which is unsound
    // against arbitrary compressed bytes and threw "trailing bytes after
    // end of compressed data" / "Called close() on a decompression stream
    // with incomplete data" against real responses. This exercises the
    // fixed central-directory-based path end to end.
    const fileData = Uint8Array.from(
      Buffer.from('a'.repeat(4000) + 'fake-png-bytes' + 'b'.repeat(4000)),
    )
    const compressedData = new Uint8Array(deflateRawSync(Buffer.from(fileData)))
    const fakeZip = buildZip({
      fileName: 'image_0.png',
      fileData,
      compressedData,
      compressionMethod: 8,
      streamedSizes: true,
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakeZip, {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const env = makeEnv()

    await generateNovelAiImage(
      env,
      makeContext(NOVELAI_V5_FULL),
      'nai-test-key',
    )

    const putCall = (
      env.GENERATION_BUCKET.put as unknown as {
        mock: { calls: unknown[][] }
      }
    ).mock.calls[0]
    const uploadedBytes = new Uint8Array(putCall[1] as ArrayBuffer)
    expect(uploadedBytes).toEqual(fileData)
  })
})

describe('hex helpers', () => {
  it('toHex/hexToBytes round-trip', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255])
    const hex = toHex(bytes.buffer as ArrayBuffer)
    expect(hex).toBe('00010f10ff')
    expect(hexToBytes(hex)).toEqual(bytes)
  })

  it('hexToBytes rejects odd-length or non-hex strings', () => {
    expect(hexToBytes('abc')).toBeNull()
    expect(hexToBytes('zz')).toBeNull()
  })

  it('timingSafeEqualHex compares equal and unequal hex strings', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true)
    expect(timingSafeEqualHex('deadbeef', 'deadbeee')).toBe(false)
    expect(timingSafeEqualHex('dead', 'deadbeef')).toBe(false)
    expect(timingSafeEqualHex('not-hex', 'deadbeef')).toBe(false)
  })
})

describe('volcEngine4KSize', () => {
  // Regression: a single shared 4K budget (3840x2160 = 8,294,400 px) is over
  // Seedream 5.0 pro's per-model ceiling of 4,624,220 px, so every 4K request
  // on pro came back `400 InvalidParameter: image area must be at most
  // 4624220 pixels`. Confirmed against real failed jobs in the DB.
  const PRO = 'doubao-seedream-5-0-pro-260628'
  const LITE = 'doubao-seedream-5-0-lite-260128'
  const PRO_MAX = 4_624_220

  it('clamps the 4K budget under the Seedream pro ceiling for every aspect ratio', () => {
    for (const aspectRatio of ['1:1', '16:9', '9:16', '4:3', '3:4']) {
      const { width, height } = volcEngine4KSize(aspectRatio, PRO)
      expect(width * height).toBeLessThanOrEqual(PRO_MAX)
    }
  })

  it('preserves the requested aspect ratio while clamping', () => {
    const { width, height } = volcEngine4KSize('16:9', PRO)
    expect(width / height).toBeCloseTo(16 / 9, 1)
  })

  it('still gives non-pro models the full 4K budget', () => {
    const { width, height } = volcEngine4KSize('16:9', LITE)
    // Above pro's cap — proves the clamp is model-specific, not blanket.
    expect(width * height).toBeGreaterThan(PRO_MAX)
    expect(width * height).toBeLessThanOrEqual(4096 * 4096)
  })

  it('emits edges Ark accepts (multiples of 16)', () => {
    for (const modelId of [PRO, LITE]) {
      for (const aspectRatio of ['1:1', '16:9', '4:3']) {
        const { width, height } = volcEngine4KSize(aspectRatio, modelId)
        expect(width % 16).toBe(0)
        expect(height % 16).toBe(0)
      }
    }
  })
})

describe('bytesToBase64', () => {
  // 分块编码必须与朴素实现逐字节等价。base64 每 3 字节 → 4 字符，所以块大小不是 3
  // 的倍数、或余数处理错，都只会在特定长度上出错——因此这里逐长度扫过块边界。
  const naive = (bytes: Uint8Array) =>
    btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))

  it('matches a known vector', () => {
    expect(bytesToBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=')
  })

  it('returns empty string for empty input', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('')
  })

  it('handles every remainder class across the chunk boundary', () => {
    const CHUNK = 32766
    for (const length of [
      1,
      2,
      3,
      CHUNK - 1,
      CHUNK,
      CHUNK + 1,
      CHUNK + 2,
      CHUNK + 3,
      CHUNK * 2 + 1,
    ]) {
      const bytes = new Uint8Array(length)
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 7 + 13) % 256
      expect(bytesToBase64(bytes), `length=${length}`).toBe(naive(bytes))
    }
  })

  it('round-trips through atob', () => {
    const bytes = new Uint8Array(100_000)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256
    const decoded = atob(bytesToBase64(bytes))
    expect(decoded.length).toBe(bytes.length)
    for (let i = 0; i < bytes.length; i += 1) {
      if (decoded.charCodeAt(i) !== bytes[i]) {
        throw new Error(`byte ${i} differs`)
      }
    }
  })

  it('encodes a multi-megabyte buffer without exhausting the call stack', () => {
    // 旧的逐字节实现正是在这个量级上把 128MB 的 Worker 撑爆的（2026-08-24 生产事故）。
    const bytes = new Uint8Array(8 * 1024 * 1024)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256
    const encoded = bytesToBase64(bytes)
    expect(encoded.length).toBe(Math.ceil(bytes.length / 3) * 4)
  })
})

describe('signBody / verifySignedBody', () => {
  it('accepts a request whose signature matches the shared secret', async () => {
    const secret = 'top-secret'
    const body = JSON.stringify({ hello: 'world' })
    const url = 'https://execution.example.com/echo'

    const request = new Request(url, {
      method: 'POST',
      headers: await createSignedRequestHeaders({ secret, body, url }),
      body,
    })

    await expect(verifySignedBody(request, secret)).resolves.toBe(body)
  })

  it('rejects a request signed with a different secret', async () => {
    const body = JSON.stringify({ hello: 'world' })
    const url = 'https://execution.example.com/echo'

    const request = new Request(url, {
      method: 'POST',
      headers: await createSignedRequestHeaders({
        secret: 'secret-a',
        body,
        url,
      }),
      body,
    })

    await expect(verifySignedBody(request, 'secret-b')).resolves.toBeNull()
  })

  it('rejects a request with no signature header', async () => {
    const request = new Request('https://execution.example.com/echo', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
    })

    await expect(verifySignedBody(request, 'top-secret')).resolves.toBeNull()
  })

  it('rejects a request after its timestamp expires', async () => {
    const secret = 'top-secret'
    const body = JSON.stringify({ hello: 'world' })
    const url = 'https://execution.example.com/echo'
    const request = new Request(url, {
      method: 'POST',
      headers: await createSignedRequestHeaders({
        secret,
        body,
        url,
        timestamp: Date.now() - 5 * 60 * 1000 - 1,
      }),
      body,
    })

    await expect(verifySignedBody(request, secret)).resolves.toBeNull()
  })
})

describe('encryptStateString / decryptStateString', () => {
  // A deterministic 32-byte key so the test doesn't depend on RNG output.
  const key = Buffer.from(new Uint8Array(32).fill(7)).toString('base64')
  const env = { STATE_ENCRYPTION_KEY: key } as EncryptEnv

  it('round-trips a plaintext string through AES-GCM', async () => {
    const ciphertext = await encryptStateString('sk-my-api-key', env)
    expect(ciphertext).not.toBe('sk-my-api-key')
    await expect(decryptStateString(ciphertext, env)).resolves.toBe(
      'sk-my-api-key',
    )
  })

  it('throws when STATE_ENCRYPTION_KEY is not configured', async () => {
    await expect(encryptStateString('x', {} as EncryptEnv)).rejects.toThrow(
      /STATE_ENCRYPTION_KEY/,
    )
  })

  it('throws when STATE_ENCRYPTION_KEY does not decode to 32 bytes', async () => {
    const shortEnv = { STATE_ENCRYPTION_KEY: 'dG9vc2hvcnQ=' } as EncryptEnv
    await expect(encryptStateString('x', shortEnv)).rejects.toThrow(/32 bytes/)
  })
})

describe('isImageResolutionTier', () => {
  it('accepts 1K/2K/4K and rejects everything else', () => {
    expect(isImageResolutionTier('1K')).toBe(true)
    expect(isImageResolutionTier('2K')).toBe(true)
    expect(isImageResolutionTier('4K')).toBe(true)
    expect(isImageResolutionTier('8K')).toBe(false)
    expect(isImageResolutionTier('')).toBe(false)
  })
})

describe('computeTieredDimensions', () => {
  it('derives width/height from a pixel budget with no other constraints', () => {
    expect(computeTieredDimensions('1:1', { targetPixels: 100 })).toEqual({
      width: 10,
      height: 10,
    })
  })

  it('shrinks height until under maxTotalPixels', () => {
    expect(
      computeTieredDimensions('1:1', { targetPixels: 100, maxTotalPixels: 50 }),
    ).toEqual({ width: 10, height: 5 })
  })

  it('grows height until over minTotalPixels', () => {
    expect(
      computeTieredDimensions('1:1', {
        targetPixels: 100,
        minTotalPixels: 150,
      }),
    ).toEqual({ width: 10, height: 15 })
  })
})

describe('tieredOpenAISize', () => {
  it('matches the documented exact 3840x2160 for 16:9 at 4K', () => {
    expect(tieredOpenAISize('16:9', '4K')).toEqual({
      size: '3840x2160',
      width: 3840,
      height: 2160,
    })
  })

  it('produces a 1024x1024 square at 1K', () => {
    expect(tieredOpenAISize('1:1', '1K')).toEqual({
      size: '1024x1024',
      width: 1024,
      height: 1024,
    })
  })
})

describe('tieredGeminiDimensions', () => {
  it('produces a 2048x2048 square at 2K', () => {
    expect(tieredGeminiDimensions('1:1', '2K')).toEqual({
      width: 2048,
      height: 2048,
    })
  })

  // At 4K, 16:9's ideal width (~5461px) exceeds computeTieredDimensions'
  // maxEdge (4096), so both edges scale down together to stay at exactly
  // 16:9 (4096x2304) instead of the un-clamped-height ~4:3 (4096x3072) that
  // independent per-edge clamping used to produce.
  it('preserves the 16:9 aspect ratio at 4K once maxEdge caps the width', () => {
    expect(tieredGeminiDimensions('16:9', '4K')).toEqual({
      width: 4096,
      height: 2304,
    })
  })
})

// 2026-07-26 事故：LoRA 装配台带参考图出图，结果完全没用上参考图。参考图一路
// 传到了 Worker（Generation.referenceImageUrl 有值），但 Worker 这份 fal 请求
// 构造没有 app 侧 adapter 的「flux-lora → /image-to-image」端点切换，
// 'fal-ai/flux-lora' 又在 FAL_TEXT_TO_IMAGE_ONLY_MODELS 里，于是 image_url /
// strength 从未被写进请求体，参考图被静默丢弃。
function makeFalImageContext(
  providerInput: Record<string, unknown> = {},
): Parameters<typeof buildFalImageInput>[0] {
  return {
    runId: 'run-1',
    workflowId: 'IMAGE_QUEUE',
    outputType: 'IMAGE',
    providerId: 'fal',
    apiKeyId: 'key-1',
    callbackUrl: 'https://cb.example.com',
    resolveKeyUrl: 'https://resolve.example.com',
    timeoutMs: 60_000,
    maxAttempts: 3,
    pollIntervalMs: 1_000,
    providerInput: {
      prompt: 'a cat',
      modelId: 'flux-lora',
      externalModelId: 'fal-ai/flux-lora',
      aspectRatio: '1:1',
      ...providerInput,
    },
  } as Parameters<typeof buildFalImageInput>[0]
}

describe('getImageReferenceInputs', () => {
  // ⭐ owner 2026-08-24 问「放了两张参照图，是只用了一张还是只是显示问题」。
  // 追完整条链（前端 referenceImages → submit-image.service 的 providerInput →
  // 这里 → OpenAI body 的 images 数组）代码是对的，但**全仓没有一条测试覆盖
  // 多张**：worker 测试里每个 referenceImages 都只有一个元素。补上，免得以后
  // 有人顺手加个 `[0]` 而闸门全绿。
  it('⭐ 有几张发几张 —— 绝不截成第一张', () => {
    expect(
      getImageReferenceInputs(
        makeFalImageContext({
          referenceImages: ['https://cdn/a.png', 'https://cdn/b.png'],
        }) as never,
      ),
    ).toEqual(['https://cdn/a.png', 'https://cdn/b.png'])
  })

  it('复数字段优先于单数的向后兼容字段', () => {
    expect(
      getImageReferenceInputs(
        makeFalImageContext({
          referenceImage: 'https://cdn/legacy.png',
          referenceImages: ['https://cdn/a.png', 'https://cdn/b.png'],
        }) as never,
      ),
    ).toEqual(['https://cdn/a.png', 'https://cdn/b.png'])
  })

  it('只有单数字段时包成一条', () => {
    expect(
      getImageReferenceInputs(
        makeFalImageContext({
          referenceImage: 'https://cdn/legacy.png',
        }) as never,
      ),
    ).toEqual(['https://cdn/legacy.png'])
  })

  it('都没有时是空数组 —— 调用方据此走 generations 而不是 edits', () => {
    expect(getImageReferenceInputs(makeFalImageContext() as never)).toEqual([])
  })
})

describe('resolveFalImageModelId', () => {
  it('keeps the text-to-image endpoint when no reference image is attached', () => {
    expect(resolveFalImageModelId(makeFalImageContext())).toBe(
      'fal-ai/flux-lora',
    )
  })

  it('swaps flux-lora to its image-to-image endpoint when a reference image is attached', () => {
    expect(
      resolveFalImageModelId(
        makeFalImageContext({ referenceImages: ['https://cdn/ref.png'] }),
      ),
    ).toBe('fal-ai/flux-lora/image-to-image')
  })

  it('also swaps for the single referenceImage field', () => {
    expect(
      resolveFalImageModelId(
        makeFalImageContext({ referenceImage: 'https://cdn/ref.png' }),
      ),
    ).toBe('fal-ai/flux-lora/image-to-image')
  })

  it('leaves models without a sibling edit endpoint alone', () => {
    expect(
      resolveFalImageModelId(
        makeFalImageContext({
          externalModelId: 'fal-ai/recraft/v4.1/pro/text-to-image',
          referenceImages: ['https://cdn/ref.png'],
        }),
      ),
    ).toBe('fal-ai/recraft/v4.1/pro/text-to-image')
  })

  it.each([
    ['fal-ai/flux-2-pro', 'fal-ai/flux-2-pro/edit'],
    ['fal-ai/flux-2/flash', 'fal-ai/flux-2/flash/edit'],
    [
      'bytedance/seedream/v5/pro/text-to-image',
      'bytedance/seedream/v5/pro/edit',
    ],
    [
      'fal-ai/bytedance/seedream/v5/lite/text-to-image',
      'fal-ai/bytedance/seedream/v5/lite/edit',
    ],
  ] as const)('swaps %s to %s when references are attached', (t2i, edit) => {
    expect(
      resolveFalImageModelId(
        makeFalImageContext({
          externalModelId: t2i,
          referenceImages: ['https://cdn/ref.png'],
        }),
      ),
    ).toBe(edit)
    expect(
      resolveFalImageModelId(
        makeFalImageContext({
          externalModelId: t2i,
        }),
      ),
    ).toBe(t2i)
  })
})

describe('buildFalImageInput reference handling', () => {
  it('sends image_url and inverted strength for flux-lora img2img', () => {
    const input = buildFalImageInput(
      makeFalImageContext({
        referenceImages: ['https://cdn/ref.png'],
        advancedParams: { referenceStrength: 0.7 },
      }),
    )

    expect(input.image_url).toBe('https://cdn/ref.png')
    // referenceStrength 0.7（越高越像参考图）→ fal 的 denoising strength 0.3。
    expect(input.strength).toBeCloseTo(0.3, 5)
  })

  it('still sends loras alongside the reference image', () => {
    const input = buildFalImageInput(
      makeFalImageContext({
        referenceImages: ['https://cdn/ref.png'],
        advancedParams: {
          referenceStrength: 0.7,
          loras: [{ url: 'https://cdn/lora.safetensors', scale: 0.85 }],
        },
      }),
    )

    expect(input.image_url).toBe('https://cdn/ref.png')
    expect(input.loras).toEqual([
      { path: 'https://cdn/lora.safetensors', scale: 0.85 },
    ])
  })

  it('omits image_url entirely when no reference image is attached', () => {
    const input = buildFalImageInput(makeFalImageContext())
    expect(input.image_url).toBeUndefined()
    expect(input.strength).toBeUndefined()
  })

  it('keeps fal T2I-only models without an edit sibling free of reference fields', () => {
    const input = buildFalImageInput(
      makeFalImageContext({
        externalModelId: 'fal-ai/recraft/v4.1/pro/text-to-image',
        referenceImages: ['https://cdn/ref.png'],
        advancedParams: { referenceStrength: 0.7 },
      }),
    )

    expect(input.image_url).toBeUndefined()
    expect(input.image_urls).toBeUndefined()
  })

  it('sends image_urls (not image_url) for fal /edit endpoints', () => {
    const refs = ['https://cdn/a.png', 'https://cdn/b.png']
    const input = buildFalImageInput(
      makeFalImageContext({
        externalModelId: 'bytedance/seedream/v5/pro/text-to-image',
        referenceImages: refs,
      }),
    )

    expect(input.image_urls).toEqual(refs)
    expect(input.image_url).toBeUndefined()
    expect(input.strength).toBeUndefined()
  })

  it('sends image_urls when the catalog id is already the /edit endpoint', () => {
    const refs = ['https://cdn/a.png']
    const input = buildFalImageInput(
      makeFalImageContext({
        externalModelId: 'fal-ai/flux-2-pro/edit',
        referenceImages: refs,
      }),
    )

    expect(input.image_urls).toEqual(refs)
    expect(input.image_url).toBeUndefined()
  })
})

describe('parseCancelRequest', () => {
  it('accepts jobId alone', () => {
    expect(parseCancelRequest({ jobId: 'job-1' })).toEqual({
      jobId: 'job-1',
      workflowInstanceId: undefined,
      provider: undefined,
      providerJobId: undefined,
    })
  })

  it('accepts every optional identifier populated', () => {
    expect(
      parseCancelRequest({
        jobId: 'job-1',
        workflowInstanceId: 'wf-1',
        provider: 'fal',
        providerJobId: 'req-1',
      }),
    ).toEqual({
      jobId: 'job-1',
      workflowInstanceId: 'wf-1',
      provider: 'fal',
      providerJobId: 'req-1',
    })
  })

  it('rejects a missing jobId', () => {
    expect(parseCancelRequest({})).toBeNull()
  })

  it('rejects a non-object body', () => {
    expect(parseCancelRequest('job-1')).toBeNull()
  })
})

describe('/cancel route', () => {
  const secret = 'test-execution-secret'
  const url = 'https://execution.example.com/cancel'
  const callbackUrl = 'https://app.example.com/api/internal/execution/callback'

  async function signedCancelRequest(body: string) {
    return new Request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await createSignedRequestHeaders({ secret, body, url })),
      },
      body,
    })
  }

  it('rejects a request with an invalid signature', async () => {
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: 'job-1' }),
    })

    const response = await executionWorker.fetch(request, {
      INTERNAL_CALLBACK_SECRET: secret,
    } as never)

    expect(response.status).toBe(401)
  })

  it('terminates the workflow instance found on its binding', async () => {
    const terminate = vi.fn().mockResolvedValue(undefined)
    const notFound = vi.fn().mockRejectedValue(new Error('not found'))
    const body = JSON.stringify({
      jobId: 'job-1',
      workflowInstanceId: 'wf-1',
    })

    const response = await executionWorker.fetch(
      await signedCancelRequest(body),
      {
        INTERNAL_CALLBACK_SECRET: secret,
        CINEMATIC_SHORT_VIDEO_WORKFLOW: { get: notFound },
        LONG_VIDEO_PIPELINE_WORKFLOW: { get: notFound },
        HYPER3D_RODIN_WORKFLOW: { get: notFound },
        HUNYUAN3D_WORKFLOW: { get: notFound },
        IMAGE_QUEUE_WORKFLOW: {
          get: vi.fn().mockResolvedValue({ id: 'wf-1', terminate }),
        },
      } as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.workflow).toEqual({
      attempted: true,
      terminated: true,
      detail: 'terminated',
    })
    expect(payload.provider).toEqual({
      attempted: false,
      ok: false,
      detail: 'No provider/providerJobId supplied.',
    })
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('degrades when the workflow instance is not found on any binding', async () => {
    const notFound = vi.fn().mockRejectedValue(new Error('not found'))
    const body = JSON.stringify({
      jobId: 'job-1',
      workflowInstanceId: 'wf-missing',
    })

    const response = await executionWorker.fetch(
      await signedCancelRequest(body),
      {
        INTERNAL_CALLBACK_SECRET: secret,
        CINEMATIC_SHORT_VIDEO_WORKFLOW: { get: notFound },
        LONG_VIDEO_PIPELINE_WORKFLOW: { get: notFound },
        HYPER3D_RODIN_WORKFLOW: { get: notFound },
        HUNYUAN3D_WORKFLOW: { get: notFound },
        IMAGE_QUEUE_WORKFLOW: { get: notFound },
      } as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.workflow.attempted).toBe(false)
    expect(payload.workflow.terminated).toBe(false)
  })

  it('degrades (not an error) when terminate rejects on an already-finished instance', async () => {
    const terminate = vi
      .fn()
      .mockRejectedValue(new Error('instance already completed'))
    const notFound = vi.fn().mockRejectedValue(new Error('not found'))
    const body = JSON.stringify({
      jobId: 'job-1',
      workflowInstanceId: 'wf-1',
    })

    const response = await executionWorker.fetch(
      await signedCancelRequest(body),
      {
        INTERNAL_CALLBACK_SECRET: secret,
        CINEMATIC_SHORT_VIDEO_WORKFLOW: { get: notFound },
        LONG_VIDEO_PIPELINE_WORKFLOW: { get: notFound },
        HYPER3D_RODIN_WORKFLOW: { get: notFound },
        HUNYUAN3D_WORKFLOW: { get: notFound },
        IMAGE_QUEUE_WORKFLOW: {
          get: vi.fn().mockResolvedValue({ id: 'wf-1', terminate }),
        },
      } as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.workflow.attempted).toBe(true)
    expect(payload.workflow.terminated).toBe(false)
  })

  it('dispatches a RunPod provider cancel using the resolved system key', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const requestUrl = String(input)
          if (requestUrl.endsWith('/resolve-key')) {
            expect(init?.method).toBe('POST')
            const parsedBody = JSON.parse(String(init?.body))
            expect(parsedBody).toEqual({
              runId: 'job-1',
              adapterType: 'runner',
              useSystemKey: true,
            })
            return new Response(
              JSON.stringify({ success: true, data: { apiKey: 'runpod-key' } }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (requestUrl.includes('/cancel/provider-job-1')) {
            expect(init?.method).toBe('POST')
            expect(
              (init?.headers as Record<string, string>).Authorization,
            ).toBe('Bearer runpod-key')
            return new Response(null, { status: 200 })
          }
          throw new Error(`Unexpected fetch: ${requestUrl}`)
        },
      )
    vi.stubGlobal('fetch', fetchMock)

    const notFound = vi.fn().mockRejectedValue(new Error('not found'))
    const body = JSON.stringify({
      jobId: 'job-1',
      provider: 'runner',
      providerJobId: 'provider-job-1',
    })

    const response = await executionWorker.fetch(
      await signedCancelRequest(body),
      {
        INTERNAL_CALLBACK_SECRET: secret,
        INTERNAL_CALLBACK_URL: callbackUrl,
        RUNPOD_ENDPOINT: 'endpoint-1',
        CINEMATIC_SHORT_VIDEO_WORKFLOW: { get: notFound },
        LONG_VIDEO_PIPELINE_WORKFLOW: { get: notFound },
        HYPER3D_RODIN_WORKFLOW: { get: notFound },
        HUNYUAN3D_WORKFLOW: { get: notFound },
        IMAGE_QUEUE_WORKFLOW: { get: notFound },
      } as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.provider).toEqual({
      attempted: true,
      ok: true,
      detail: 'RunPod cancel requested.',
    })
  })

  it('reports an unsupported provider without throwing', async () => {
    const notFound = vi.fn().mockRejectedValue(new Error('not found'))
    const body = JSON.stringify({
      jobId: 'job-1',
      provider: 'fish_audio',
      providerJobId: 'whatever',
    })

    const response = await executionWorker.fetch(
      await signedCancelRequest(body),
      {
        INTERNAL_CALLBACK_SECRET: secret,
        INTERNAL_CALLBACK_URL: callbackUrl,
        CINEMATIC_SHORT_VIDEO_WORKFLOW: { get: notFound },
        LONG_VIDEO_PIPELINE_WORKFLOW: { get: notFound },
        HYPER3D_RODIN_WORKFLOW: { get: notFound },
        HUNYUAN3D_WORKFLOW: { get: notFound },
        IMAGE_QUEUE_WORKFLOW: { get: notFound },
      } as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.provider.attempted).toBe(false)
    expect(payload.provider.ok).toBe(false)
  })

  it('resolves the volcengine cancel task URL and reports the upstream status', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const requestUrl = String(input)
          if (requestUrl.endsWith('/resolve-key')) {
            return new Response(
              JSON.stringify({ success: true, data: { apiKey: 'ark-key' } }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (
            requestUrl ===
            'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task-1'
          ) {
            expect(init?.method).toBe('DELETE')
            // Ark's own limit: only a still-queued task can actually be
            // cancelled — a running one 400s here, and that's not a bug.
            return new Response(null, { status: 400 })
          }
          throw new Error(`Unexpected fetch: ${requestUrl}`)
        },
      )
    vi.stubGlobal('fetch', fetchMock)

    const notFound = vi.fn().mockRejectedValue(new Error('not found'))
    const body = JSON.stringify({
      jobId: 'job-1',
      provider: 'volcengine',
      providerJobId: 'task-1',
    })

    const response = await executionWorker.fetch(
      await signedCancelRequest(body),
      {
        INTERNAL_CALLBACK_SECRET: secret,
        INTERNAL_CALLBACK_URL: callbackUrl,
        CINEMATIC_SHORT_VIDEO_WORKFLOW: { get: notFound },
        LONG_VIDEO_PIPELINE_WORKFLOW: { get: notFound },
        HYPER3D_RODIN_WORKFLOW: { get: notFound },
        HUNYUAN3D_WORKFLOW: { get: notFound },
        IMAGE_QUEUE_WORKFLOW: { get: notFound },
      } as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.provider.attempted).toBe(true)
    expect(payload.provider.ok).toBe(false)
  })

  it('resolves the MiniMax cancel task URL and reports the upstream status', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const requestUrl = String(input)
          if (requestUrl.endsWith('/resolve-key')) {
            return new Response(
              JSON.stringify({ success: true, data: { apiKey: 'mm-key' } }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (
            requestUrl === 'https://api.minimax.io/v2/video_generation/task-1'
          ) {
            expect(init?.method).toBe('DELETE')
            // MiniMax's own limit (same shape as VolcEngine/Ark above): only
            // a still-queued task can be cancelled — a running one errors,
            // and that's not a bug in this branch.
            return new Response(null, { status: 400 })
          }
          throw new Error(`Unexpected fetch: ${requestUrl}`)
        },
      )
    vi.stubGlobal('fetch', fetchMock)

    const notFound = vi.fn().mockRejectedValue(new Error('not found'))
    const body = JSON.stringify({
      jobId: 'job-1',
      provider: 'minimax',
      providerJobId: 'task-1',
    })

    const response = await executionWorker.fetch(
      await signedCancelRequest(body),
      {
        INTERNAL_CALLBACK_SECRET: secret,
        INTERNAL_CALLBACK_URL: callbackUrl,
        CINEMATIC_SHORT_VIDEO_WORKFLOW: { get: notFound },
        LONG_VIDEO_PIPELINE_WORKFLOW: { get: notFound },
        HYPER3D_RODIN_WORKFLOW: { get: notFound },
        HUNYUAN3D_WORKFLOW: { get: notFound },
        IMAGE_QUEUE_WORKFLOW: { get: notFound },
      } as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.provider.attempted).toBe(true)
    expect(payload.provider.ok).toBe(false)
  })

  it('reports unsupported for a provider with no cancel dispatch (e.g. Fish Audio)', async () => {
    const env = {
      INTERNAL_CALLBACK_SECRET: secret,
      INTERNAL_CALLBACK_URL: callbackUrl,
    } as unknown as Parameters<typeof cancelProviderJob>[0]

    const result = await cancelProviderJob(env, 'job-1', 'fish_audio', 'x')
    expect(result).toEqual({
      attempted: false,
      ok: false,
      detail:
        'Provider "fish_audio" has no cancel dispatch (unsupported, or synchronous with nothing to cancel — e.g. Fish Audio).',
    })
  })
})

/**
 * 上游取消需要 providerJobId，而 app 侧发来的 providerJobId 此前恒为空——本节
 * 补的是「拿到上游 id 就立刻回写」这条链：四个提交点各自算出 providerJobId 后
 * 调 reportProviderJobId 发一次 kind:'status' 回调，让 app 侧 CAS 写
 * GenerationJob.providerJobId，取消时才有 id 可用。
 */
describe('reportProviderJobId', () => {
  const context = { runId: 'run-1', callbackUrl: 'https://cb.example.com' }

  it('posts a kind:status callback with the providerJobId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await reportProviderJobId(
      { INTERNAL_CALLBACK_SECRET: 'secret-1' } as never,
      context,
      'provider-job-1',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cb.example.com')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.runId).toBe('run-1')
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({ providerJobId: 'provider-job-1' })
  })

  it('is a no-op when the callback secret is not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await reportProviderJobId({} as never, context, 'provider-job-1')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows a failed callback and never throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      reportProviderJobId(
        { INTERNAL_CALLBACK_SECRET: 'secret-1' } as never,
        context,
        'provider-job-1',
      ),
    ).resolves.toBeUndefined()
  })

  it('swallows a non-2xx callback response and never throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      reportProviderJobId(
        { INTERNAL_CALLBACK_SECRET: 'secret-1' } as never,
        context,
        'provider-job-1',
      ),
    ).resolves.toBeUndefined()
  })
})

describe('provider submit reports providerJobId', () => {
  const env = { INTERNAL_CALLBACK_SECRET: 'secret-1' } as never

  it('fal: reports the {model_id}/requests/{request_id} path segment cancelProviderJob expects', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://queue.fal.run/ext-1') {
          return new Response(
            JSON.stringify({
              request_id: 'req-1',
              status_url: 'https://queue.fal.run/ext-1/requests/req-1/status',
              response_url: 'https://queue.fal.run/ext-1/requests/req-1',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        // The report callback — reply ok so the call resolves cleanly.
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = parseWorkerRunContext(
      makeVideoInput({ providerInput: { modelId: 'kling-v3-pro' } }),
    )
    if (!context) throw new Error('expected a valid video context')

    await submitFalQueue(context, 'fal-key', env, true)

    const reportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === context.callbackUrl,
    )
    if (!reportCall) throw new Error('expected a report callback fetch call')
    const body = JSON.parse(String(reportCall[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.kind).toBe('status')
    // endpointModelId for this context resolves to providerInput.externalModelId
    // ('ext-1') since there's no i2vModelId/referenceImage override.
    expect(body.data).toEqual({ providerJobId: 'ext-1/requests/req-1' })
  })

  it('fal image: reports the {model_id}/requests/{request_id} path segment', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://queue.fal.run/fal-ai/flux-lora') {
          return new Response(
            JSON.stringify({
              request_id: 'img-req-1',
              status_url:
                'https://queue.fal.run/fal-ai/flux-lora/requests/img-req-1/status',
              response_url:
                'https://queue.fal.run/fal-ai/flux-lora/requests/img-req-1',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = makeFalImageContext() as Parameters<
      typeof submitFalImageQueue
    >[0]

    await submitFalImageQueue(context, 'fal-key', env)

    const reportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === context.callbackUrl,
    )
    if (!reportCall) throw new Error('expected a report callback fetch call')
    const body = JSON.parse(String(reportCall[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({
      providerJobId: 'fal-ai/flux-lora/requests/img-req-1',
    })
  })

  it('fal 3D (Hunyuan3D): reports the {model_id}/requests/{request_id} path segment', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://queue.fal.run/ext-3d') {
          return new Response(
            JSON.stringify({
              request_id: '3d-req-1',
              status_url:
                'https://queue.fal.run/ext-3d/requests/3d-req-1/status',
              response_url: 'https://queue.fal.run/ext-3d/requests/3d-req-1',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = parseModel3DRunContext(makeModel3DInput())
    if (!context) throw new Error('expected a valid 3D context')

    await submitFalModel3DQueue(context, 'fal-key', env)

    const reportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === context.callbackUrl,
    )
    if (!reportCall) throw new Error('expected a report callback fetch call')
    const body = JSON.parse(String(reportCall[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({
      providerJobId: 'ext-3d/requests/3d-req-1',
    })
  })

  it('MiniMax: reports the bare task_id', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://api.minimax.io/v2/video_generation') {
          return new Response(JSON.stringify({ task_id: 'mm-task-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = parseWorkerRunContext(
      makeVideoInput({ providerId: 'minimax' }),
    )
    if (!context) throw new Error('expected a valid video context')

    await submitMiniMaxQueue(context, 'mm-key', env)

    const reportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === context.callbackUrl,
    )
    if (!reportCall) throw new Error('expected a report callback fetch call')
    const body = JSON.parse(String(reportCall[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({ providerJobId: 'mm-task-1' })
  })

  it('VolcEngine: reports the bare task id', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (
          requestUrl ===
          'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
        ) {
          return new Response(JSON.stringify({ id: 'volc-task-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = parseWorkerRunContext(
      makeVideoInput({ providerId: 'volcengine' }),
    )
    if (!context) throw new Error('expected a valid video context')

    await submitVolcEngineQueue(context, 'volc-key', env)

    const reportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === context.callbackUrl,
    )
    if (!reportCall) throw new Error('expected a report callback fetch call')
    const body = JSON.parse(String(reportCall[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({ providerJobId: 'volc-task-1' })
  })

  it('Replicate: reports the bare prediction id', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://api.replicate.com/v1/predictions') {
          return new Response(
            JSON.stringify({ id: 'replicate-pred-1', status: 'starting' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = makeFalImageContext({
      modelId: 'flux-dev',
      externalModelId: 'black-forest-labs/flux-dev',
    }) as Parameters<typeof submitReplicateImagePrediction>[0]

    await submitReplicateImagePrediction(
      { ...context, providerId: 'replicate' },
      env,
      'replicate-key',
    )

    const reportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === context.callbackUrl,
    )
    if (!reportCall) throw new Error('expected a report callback fetch call')
    const body = JSON.parse(String(reportCall[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({ providerJobId: 'replicate-pred-1' })
  })

  it('RunPod (runner): reports the bare job id', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://api.runpod.ai/v2/runner-endpoint/run') {
          return new Response(JSON.stringify({ id: 'runpod-job-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = makeFalImageContext({
      externalModelId: 'waiIllustriousSDXL_v150',
      aspectRatio: '1:1',
    }) as Parameters<typeof submitRunnerImageJob>[0]
    const runnerEnv = {
      INTERNAL_CALLBACK_SECRET: 'secret-1',
      RUNPOD_ENDPOINT: 'runner-endpoint',
    } as unknown as Parameters<typeof submitRunnerImageJob>[1]

    await submitRunnerImageJob(
      { ...context, providerId: 'runner' },
      runnerEnv,
      'runpod-key',
    )

    const reportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === context.callbackUrl,
    )
    if (!reportCall) throw new Error('expected a report callback fetch call')
    const body = JSON.parse(String(reportCall[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({ providerJobId: 'runpod-job-1' })
  })

  it('Qwen submits all references to the evaluation endpoint and preserves its route for polling and cancel', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : {},
        })
        if (String(url).endsWith('/run'))
          return Response.json({ id: 'qwen-job' })
        if (String(url).includes('/status/'))
          return Response.json({ status: 'IN_QUEUE' })
        if (String(url).includes('resolve-key'))
          return Response.json({ success: true, data: { apiKey: 'test' } })
        return new Response(null, { status: 200 })
      }),
    )
    const env = {
      INTERNAL_CALLBACK_SECRET: 'secret',
      INTERNAL_CALLBACK_URL:
        'https://app.example.com/api/internal/execution/callback',
      RUNPOD_ENDPOINT: 'sdxl-endpoint',
      RUNPOD_QWEN_ENDPOINT: 'qwen-endpoint',
    } as never
    const context = {
      ...makeFalImageContext({
        externalModelId: 'qwen-image-2.1',
        referenceImages: [
          'https://cdn.example.com/a.png',
          'https://cdn.example.com/b.png',
        ],
      }),
      providerId: 'runner',
    }
    const job = await submitRunnerImageJob(context, env, 'test')
    expect(job.id).toBe('qwen-endpoint/qwen-job')
    expect(requests.find((r) => r.url.endsWith('/run'))).toMatchObject({
      url: 'https://api.runpod.ai/v2/qwen-endpoint/run',
      body: {
        input: {
          images_to_fetch: [
            { name: 'reference-1.png' },
            { name: 'reference-2.png' },
          ],
          workflow: {
            encode: {
              class_type: 'TextEncodeQwenImage21',
              inputs: { 'images.image_2': ['reference-2', 0] },
            },
            sampler: {
              inputs: { cfg: 1, steps: 25, latent_image: ['encode', 2] },
            },
          },
        },
      },
    })
    await pollAndPersistRunnerImageJob(job.id, env, 'test', 'image/test.png')
    expect(
      await cancelProviderJob(env, 'job-1', 'runner', job.id),
    ).toMatchObject({ ok: true })
    expect(requests.map((r) => r.url)).toContain(
      'https://api.runpod.ai/v2/qwen-endpoint/status/qwen-job',
    )
    expect(requests.map((r) => r.url)).toContain(
      'https://api.runpod.ai/v2/qwen-endpoint/cancel/qwen-job',
    )
    expect(requests.some((r) => r.url.includes('sdxl-endpoint'))).toBe(false)
    await expect(
      pollAndPersistRunnerImageJob(
        'foreign/job',
        env,
        'test',
        'image/test.png',
      ),
    ).rejects.toThrow('Unknown Runner job endpoint')
  })

  it('a failed report callback does not affect the returned submit result', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://queue.fal.run/ext-1') {
          return new Response(
            JSON.stringify({
              request_id: 'req-1',
              status_url: 'https://queue.fal.run/ext-1/requests/req-1/status',
              response_url: 'https://queue.fal.run/ext-1/requests/req-1',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        // The report callback fails outright — must not surface as a thrown
        // error from submitFalQueue, which has already succeeded upstream.
        throw new Error('callback host unreachable')
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = parseWorkerRunContext(
      makeVideoInput({ providerInput: { modelId: 'kling-v3-pro' } }),
    )
    if (!context) throw new Error('expected a valid video context')

    await expect(
      submitFalQueue(context, 'fal-key', env, true),
    ).resolves.toEqual({
      requestId: 'req-1',
      statusUrl: 'https://queue.fal.run/ext-1/requests/req-1/status',
      responseUrl: 'https://queue.fal.run/ext-1/requests/req-1',
    })
  })

  it('long-video clip path never reports providerJobId (its callbackUrl is the pipeline advanceUrl, not a GenerationJob callback)', async () => {
    // owner 2026-09-04: LongVideoPipelineAdvanceRequestSchema (see
    // src/app/api/internal/execution/long-video/advance/route.ts) 400s on an
    // unrecognized kind:'status' payload, and the per-clip synthetic runId
    // (`${runId}:clip-${clipIndex}`) doesn't correspond to any GenerationJob
    // row anyway — so this path must never call reportProviderJobId. That's
    // wired via submitFalLongVideoClipQueue → submitFalQueue(..., false);
    // this test locks the call-site wiring itself, not just submitFalQueue's
    // own reportProviderJob flag, since a flipped `false` → `true` at the
    // call site is exactly the regression that shipped for a day.
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const requestUrl = String(input)
        if (requestUrl === 'https://queue.fal.run/e') {
          return new Response(
            JSON.stringify({
              request_id: 'req-clip-1',
              status_url: 'https://queue.fal.run/e/requests/req-clip-1/status',
              response_url: 'https://queue.fal.run/e/requests/req-clip-1',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        // Any other call (in particular a report POST to advanceUrl) is the
        // exact bug this test guards against.
        throw new Error(`Unexpected fetch: ${requestUrl}`)
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = parseLongVideoPipelineRunContext(
      makeLongVideoInput({ providerInput: { modelId: 'kling-v3-pro' } }),
    )
    if (!context) throw new Error('expected a valid long-video context')

    const result = await submitFalLongVideoClipQueue(
      context,
      'fal-key',
      0,
      undefined,
      undefined,
      env,
    )

    expect(result.queue.requestId).toBe('req-clip-1')
    expect(
      fetchMock.mock.calls.some(
        ([input]) => String(input) === context.advanceUrl,
      ),
    ).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('OpenAI image streaming execution', () => {
  it('sends 2.5 settings, reports partials and persists only the final image as the result', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const env = {
      GENERATION_BUCKET: { put },
      R2_PUBLIC_URL: 'https://cdn.example.com',
      INTERNAL_CALLBACK_SECRET: 'test-secret',
    } as unknown as Parameters<typeof generateOpenAIImage>[0]
    const context = {
      workflowId: 'IMAGE_QUEUE',
      outputType: 'IMAGE',
      providerId: 'openai',
      resolveKeyUrl: 'https://app.example.com/key',
      timeoutMs: 300000,
      maxAttempts: 1,
      pollIntervalMs: 1000,
      runId: 'image-test',
      callbackUrl: 'https://app.example.com/callback',
      providerInput: {
        modelId: 'gpt-image-2.5-flare',
        externalModelId: 'gpt-image-2.5-flare',
        prompt: 'a cat',
        aspectRatio: '1:1',
        advancedParams: {
          quality: 'max',
          background: 'transparent',
          resolution: '2K',
          preview: true,
        },
      },
    } as Parameters<typeof generateOpenAIImage>[1]
    const frames = [
      {
        type: 'image_generation.partial_image',
        b64_json: 'cHJldmlldw==',
        partial_image_index: 0,
      },
      { type: 'image_generation.completed', b64_json: 'ZmluYWw=' },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join('')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(frames, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
      .mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateOpenAIImage(env, context, 'test-key')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      stream: true,
      partial_images: 2,
      quality: 'max',
      background: 'transparent',
      size: '2048x2048',
      output_format: 'png',
    })
    expect(put).toHaveBeenNthCalledWith(
      1,
      'image/previews/image-test/0.png',
      expect.any(Uint8Array),
      expect.any(Object),
    )
    expect(result.artifactUrl).toBe(
      'https://cdn.example.com/image/image-test.png',
    )
    expect(new TextDecoder().decode(put.mock.calls[1][1])).toBe('final')
    const callback = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(callback).toMatchObject({
      kind: 'status',
      data: {
        previewUrl: 'https://cdn.example.com/image/previews/image-test/0.png',
      },
    })
  })
})

/**
 * `input_fidelity` 是 `/v1/images/edits` 的字段 —— 挂了参考图才有那条路，
 * 纯文生图走 `/v1/images/generations`，把它发过去是 400。所以这两例锁的不是
 * 「值有没有被读出来」，是**它只跟着参考图走**。
 * https://developers.openai.com/api/reference/resources/images/methods/edit
 */
describe('OpenAI input fidelity', () => {
  function openAiEnv(): {
    env: Parameters<typeof generateOpenAIImage>[0]
    put: ReturnType<typeof vi.fn>
  } {
    const put = vi.fn().mockResolvedValue(undefined)
    return {
      env: {
        GENERATION_BUCKET: { put },
        R2_PUBLIC_URL: 'https://cdn.example.com',
      } as unknown as Parameters<typeof generateOpenAIImage>[0],
      put,
    }
  }

  function openAiContext(
    providerInput: Record<string, unknown>,
  ): Parameters<typeof generateOpenAIImage>[1] {
    return {
      workflowId: 'IMAGE_QUEUE',
      outputType: 'IMAGE',
      providerId: 'openai',
      resolveKeyUrl: 'https://app.example.com/key',
      timeoutMs: 300000,
      maxAttempts: 1,
      pollIntervalMs: 1000,
      runId: 'fidelity-test',
      callbackUrl: 'https://app.example.com/callback',
      providerInput: {
        modelId: 'gpt-image-2.5-sunburst',
        externalModelId: 'gpt-image-2.5-sunburst',
        prompt: 'a cat',
        aspectRatio: '1:1',
        ...providerInput,
      },
    } as Parameters<typeof generateOpenAIImage>[1]
  }

  function stubImageResponse(): ReturnType<typeof vi.fn> {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: 'ZmluYWw=' }] })),
      )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('sends input_fidelity on the edits route when a reference is attached', async () => {
    const { env } = openAiEnv()
    const fetchMock = stubImageResponse()

    await generateOpenAIImage(
      env,
      openAiContext({
        referenceImages: ['https://cdn.example.com/ref.png'],
        advancedParams: { inputFidelity: 'high' },
      }),
      'test-key',
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    expect(JSON.parse(String(init.body))).toMatchObject({
      input_fidelity: 'high',
      images: [{ image_url: 'https://cdn.example.com/ref.png' }],
    })
  })

  it('omits input_fidelity on the text-only generations route', async () => {
    const { env } = openAiEnv()
    const fetchMock = stubImageResponse()

    await generateOpenAIImage(
      env,
      openAiContext({ advancedParams: { inputFidelity: 'high' } }),
      'test-key',
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/generations')
    expect(JSON.parse(String(init.body))).not.toHaveProperty('input_fidelity')
  })

  it('sends nothing when the chip was never touched', async () => {
    const { env } = openAiEnv()
    const fetchMock = stubImageResponse()

    await generateOpenAIImage(
      env,
      openAiContext({
        referenceImages: ['https://cdn.example.com/ref.png'],
        advancedParams: { quality: 'high' },
      }),
      'test-key',
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).not.toHaveProperty('input_fidelity')
  })
})

/**
 * 火山 Ark / BytePlus 的 `background: "transparent"`（进度表 63）。文档三条
 * 前置：仅 Seedream 5.0 pro、仅图生图、且只收 1 张带透明通道的输入图。这里锁
 * 的是**不满足前置时一个字段都不发** —— 发过去只会换一个 400，而校验层已经
 * 在应用侧把同一种情况变成了可读错误。
 * https://www.volcengine.com/docs/82379/1541523
 */
describe('VolcEngine transparent background', () => {
  function volcEnv(): Parameters<typeof generateVolcEngineImage>[0] {
    return {
      GENERATION_BUCKET: { put: vi.fn().mockResolvedValue(undefined) },
      R2_PUBLIC_URL: 'https://cdn.example.com',
    } as unknown as Parameters<typeof generateVolcEngineImage>[0]
  }

  function volcContext(
    providerInput: Record<string, unknown>,
  ): Parameters<typeof generateVolcEngineImage>[1] {
    return {
      workflowId: 'IMAGE_QUEUE',
      outputType: 'IMAGE',
      providerId: 'volcengine',
      resolveKeyUrl: 'https://app.example.com/key',
      timeoutMs: 300000,
      maxAttempts: 1,
      pollIntervalMs: 1000,
      runId: 'volc-bg-test',
      callbackUrl: 'https://app.example.com/callback',
      providerInput: {
        modelId: 'seedream-5.0-pro-volcengine',
        externalModelId: 'doubao-seedream-5-0-pro-260628',
        prompt: 'a cat',
        aspectRatio: '1:1',
        ...providerInput,
      },
    } as Parameters<typeof generateVolcEngineImage>[1]
  }

  function stubVolcImageResponse(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/images/generations')
        ? new Response(
            JSON.stringify({
              data: [{ url: 'https://ark.example.com/out.png' }],
            }),
          )
        : new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'image/png' },
          }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  function volcBody(
    fetchMock: ReturnType<typeof vi.fn>,
  ): Record<string, unknown> {
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    return JSON.parse(String(init.body)) as Record<string, unknown>
  }

  it('sends background and pins png with exactly one reference image', async () => {
    const fetchMock = stubVolcImageResponse()
    await generateVolcEngineImage(
      volcEnv(),
      volcContext({
        referenceImages: ['https://cdn.example.com/ref.png'],
        advancedParams: { background: 'transparent' },
      }),
      'volc-key',
    )
    // ⚠ output_format 必须一起钉成 png：文档写「透明背景模式下输出默认为
    // png，若同时配置 output_format 为 jpeg 将触发报错」。
    expect(volcBody(fetchMock)).toMatchObject({
      background: 'transparent',
      output_format: 'png',
    })
  })

  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('omits background with %s', async (_label, referenceImages) => {
    const fetchMock = stubVolcImageResponse()
    await generateVolcEngineImage(
      volcEnv(),
      volcContext({
        referenceImages,
        advancedParams: { background: 'transparent' },
      }),
      'volc-key',
    )
    expect(volcBody(fetchMock)).not.toHaveProperty('background')
    expect(volcBody(fetchMock)).not.toHaveProperty('output_format')
  })

  it('omits background on Seedream 5.0 Lite', async () => {
    const fetchMock = stubVolcImageResponse()
    await generateVolcEngineImage(
      volcEnv(),
      volcContext({
        externalModelId: 'doubao-seedream-5-0-lite-260128',
        referenceImages: ['https://cdn.example.com/ref.png'],
        advancedParams: { background: 'transparent' },
      }),
      'volc-key',
    )
    expect(volcBody(fetchMock)).not.toHaveProperty('background')
  })

  it('omits background when the chip sits on its opaque default', async () => {
    const fetchMock = stubVolcImageResponse()
    await generateVolcEngineImage(
      volcEnv(),
      volcContext({
        referenceImages: ['https://cdn.example.com/ref.png'],
        advancedParams: { background: 'opaque' },
      }),
      'volc-key',
    )
    expect(volcBody(fetchMock)).not.toHaveProperty('background')
  })
})

/**
 * 图层拆分（进度表 62）。fixture 就是 Ark 文档「图层拆分」那一页给出的示例响应
 * ——底图 z_index 0 是 jpeg、图层是带 bounding_box / name / description 的 png。
 * 锁三件事：开关按前置发、data[] 全量落 R2、底图按响应尺寸而不是请求档位。
 * https://www.volcengine.com/docs/82379/1541523
 */
describe('VolcEngine layer decomposition', () => {
  // 文档示例响应，逐字段保留（只把 url 换成可解析的主机名）。
  const DOC_RESPONSE = {
    model: 'doubao-seedream-5-0-pro-260628',
    created: 1784696685,
    data: [
      {
        url: 'https://ark.example.com/base.jpg',
        size: '2048x2048',
        output_format: 'jpeg',
        z_index: 0,
      },
      {
        url: 'https://ark.example.com/layer-1.png',
        size: '1273x265',
        output_format: 'png',
        z_index: 1,
        bounding_box: {
          absolute: [383, 120, 1655, 384],
          normalized: [187, 59, 808, 188],
        },
        name: 'Seedream标题文字',
        description: '黄色大号衬线字体的Seedream标题文字',
      },
    ],
    usage: {
      input_images: 1,
      generated_images: 8,
      output_tokens: 23107,
      total_tokens: 23107,
    },
  }

  function layerEnv(): {
    env: Parameters<typeof generateVolcEngineImage>[0]
    put: ReturnType<typeof vi.fn>
  } {
    const put = vi.fn().mockResolvedValue(undefined)
    return {
      env: {
        GENERATION_BUCKET: { put },
        R2_PUBLIC_URL: 'https://cdn.example.com',
      } as unknown as Parameters<typeof generateVolcEngineImage>[0],
      put,
    }
  }

  function layerContext(
    providerInput: Record<string, unknown>,
  ): Parameters<typeof generateVolcEngineImage>[1] {
    return {
      workflowId: 'IMAGE_QUEUE',
      outputType: 'IMAGE',
      providerId: 'volcengine',
      resolveKeyUrl: 'https://app.example.com/key',
      timeoutMs: 300000,
      maxAttempts: 1,
      pollIntervalMs: 1000,
      runId: 'volc-layer-test',
      callbackUrl: 'https://app.example.com/callback',
      providerInput: {
        modelId: 'seedream-5.0-pro-volcengine',
        externalModelId: 'doubao-seedream-5-0-pro-260628',
        prompt: 'split this poster',
        aspectRatio: '1:1',
        outputStorageKey: 'image/volc-layer-test.png',
        ...providerInput,
      },
    } as Parameters<typeof generateVolcEngineImage>[1]
  }

  function stubDocResponse(
    payload: unknown = DOC_RESPONSE,
  ): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/images/generations')
        ? new Response(JSON.stringify(payload))
        : new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'image/png' },
          }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('uploads every artifact and reports the layers alongside the base', async () => {
    const { env, put } = layerEnv()
    const fetchMock = stubDocResponse()

    const result = await generateVolcEngineImage(
      env,
      layerContext({
        referenceImages: ['https://cdn.example.com/poster.png'],
        advancedParams: { layerDecomposition: true },
      }),
      'volc-key',
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      layer_decomposition: true,
    })

    // 底图走既有的单产物出口，图层各自一把 key。
    expect(put.mock.calls.map((call) => call[0])).toEqual([
      'image/volc-layer-test.png',
      'image/volc-layer-test-layer-1.png',
    ])
    expect(result.artifactUrl).toBe(
      'https://cdn.example.com/image/volc-layer-test.png',
    )
    // 图层模式下 size 是档位/auto，底图跟输入图走 —— 尺寸必须读响应，
    // ⛔ 不能沿用请求里那个名义尺寸。
    expect(result.width).toBe(2048)
    expect(result.height).toBe(2048)

    expect(result.layers).toEqual([
      {
        zIndex: 1,
        artifactUrl:
          'https://cdn.example.com/image/volc-layer-test-layer-1.png',
        imageR2Key: 'image/volc-layer-test-layer-1.png',
        mimeType: 'image/png',
        width: 1273,
        height: 265,
        name: 'Seedream标题文字',
        description: '黄色大号衬线字体的Seedream标题文字',
        boundingBox: {
          absolute: [383, 120, 1655, 384],
          normalized: [187, 59, 808, 188],
        },
      },
    ])
  })

  // 文档没承诺 data[] 的顺序，底图只能按 z_index === 0 认。
  it('finds the base plate by z_index rather than array position', async () => {
    const { env } = layerEnv()
    stubDocResponse({
      ...DOC_RESPONSE,
      data: [DOC_RESPONSE.data[1], DOC_RESPONSE.data[0]],
    })

    const result = await generateVolcEngineImage(
      env,
      layerContext({
        referenceImages: ['https://cdn.example.com/poster.png'],
        advancedParams: { layerDecomposition: true },
      }),
      'volc-key',
    )

    expect(result.width).toBe(2048)
    expect(result.layers).toHaveLength(1)
    expect(result.layers?.[0].zIndex).toBe(1)
  })

  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('omits layer_decomposition with %s', async (_label, referenceImages) => {
    const { env } = layerEnv()
    const fetchMock = stubDocResponse({
      data: [{ url: 'https://ark.example.com/out.png' }],
    })

    const result = await generateVolcEngineImage(
      env,
      layerContext({
        referenceImages,
        advancedParams: { layerDecomposition: true },
      }),
      'volc-key',
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).not.toHaveProperty(
      'layer_decomposition',
    )
    expect(result.layers).toBeUndefined()
  })

  it('omits layer_decomposition on Seedream 5.0 Lite', async () => {
    const { env } = layerEnv()
    const fetchMock = stubDocResponse({
      data: [{ url: 'https://ark.example.com/out.png' }],
    })

    await generateVolcEngineImage(
      env,
      layerContext({
        externalModelId: 'doubao-seedream-5-0-lite-260128',
        referenceImages: ['https://cdn.example.com/poster.png'],
        advancedParams: { layerDecomposition: true },
      }),
      'volc-key',
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).not.toHaveProperty(
      'layer_decomposition',
    )
  })

  // 关着的时候这条路必须和以前一模一样：单产物、请求尺寸、没有 layers。
  it('leaves the single-artifact path untouched when the toggle is off', async () => {
    const { env, put } = layerEnv()
    stubDocResponse({ data: [{ url: 'https://ark.example.com/out.png' }] })

    const result = await generateVolcEngineImage(
      env,
      layerContext({ referenceImages: ['https://cdn.example.com/a.png'] }),
      'volc-key',
    )

    expect(put).toHaveBeenCalledTimes(1)
    expect(result.layers).toBeUndefined()
    expect(result.width).toBe(2048)
  })
})

/**
 * Runner（自建 RunPod ComfyUI）是唯一会长时间停在 IN_QUEUE 的图片通道：冷启动
 * 要载 6.9GB 底模。此前 worker 的图片路径不回报任何阶段，主站分不清「排队等
 * GPU 冷启动」和「没人接单」，于是把两种情况显示成同一个「生成中」。
 * 这一节锁的是回报本身：提交后一次 runnerQueued，首次离开队列一次
 * runnerRunning，之后不再重复。判据/超时一律不参与。
 */
interface CallbackBody {
  runId?: string
  kind?: string
  data?: { executionStage?: string; providerJobId?: string }
}

function readCallbackBody(init: RequestInit): CallbackBody {
  return JSON.parse(String(init.body)) as CallbackBody
}

describe('reportExecutionStage', () => {
  const context = { runId: 'run-1', callbackUrl: 'https://cb.example.com' }

  it('posts a kind:status callback carrying the stage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await reportExecutionStage(
      { INTERNAL_CALLBACK_SECRET: 'secret-1' } as never,
      context,
      'runnerRunning',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cb.example.com')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.runId).toBe('run-1')
    expect(body.kind).toBe('status')
    expect(body.data).toEqual({ executionStage: 'runnerRunning' })
  })

  it('is a no-op when the callback secret is not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await reportExecutionStage({} as never, context, 'runnerQueued')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows transport and non-2xx failures, never throws', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const env = { INTERNAL_CALLBACK_SECRET: 'secret-1' } as never
    await expect(
      reportExecutionStage(env, context, 'runnerQueued'),
    ).resolves.toBeUndefined()
    await expect(
      reportExecutionStage(env, context, 'runnerQueued'),
    ).resolves.toBeUndefined()
  })

  it('runner submit reports runnerQueued right after the job id', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://api.runpod.ai/v2/runner-endpoint/run') {
          return Response.json({ id: 'runpod-job-1' })
        }
        return new Response(null, { status: 200 })
      })
    vi.stubGlobal('fetch', fetchMock)

    const context = makeFalImageContext({
      externalModelId: 'waiIllustriousSDXL_v150',
      aspectRatio: '1:1',
    }) as Parameters<typeof submitRunnerImageJob>[0]

    await submitRunnerImageJob(
      { ...context, providerId: 'runner' },
      {
        INTERNAL_CALLBACK_SECRET: 'secret-1',
        RUNPOD_ENDPOINT: 'runner-endpoint',
      } as unknown as Parameters<typeof submitRunnerImageJob>[1],
      'runpod-key',
    )

    const stageCallbacks = fetchMock.mock.calls
      .filter(([input]) => String(input) === context.callbackUrl)
      .map(([, init]) => readCallbackBody(init as RequestInit))
      .filter((body) => body.data?.executionStage !== undefined)
    expect(stageCallbacks).toHaveLength(1)
    expect(stageCallbacks[0]).toMatchObject({
      kind: 'status',
      data: { executionStage: 'runnerQueued' },
    })
  })

  it('runner image workflow reports runnerRunning once, on the first IN_PROGRESS poll', async () => {
    const pollStatuses = ['IN_QUEUE', 'IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED']
    let pollIndex = 0
    const put = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://resolve.example.com')
          return Response.json({
            success: true,
            data: { apiKey: 'runpod-key' },
          })
        if (url === 'https://cb.example.com')
          return Response.json({ success: true })
        if (url === 'https://api.runpod.ai/v2/runner-endpoint/run')
          return Response.json({ id: 'runpod-job-1' })
        if (
          url === 'https://api.runpod.ai/v2/runner-endpoint/status/runpod-job-1'
        ) {
          const status =
            pollStatuses[Math.min(pollIndex, pollStatuses.length - 1)]
          pollIndex += 1
          if (status !== 'COMPLETED') return Response.json({ status })
          return Response.json({
            status,
            output: {
              images: [{ data: bytesToBase64(new Uint8Array([1, 2, 3])) }],
            },
          })
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })
    vi.stubGlobal('fetch', fetchMock)

    class TestWorkflow extends ImageQueueWorkflow {
      setEnv(env: unknown) {
        this.env = env as never
      }
    }
    const workflow = new TestWorkflow()
    workflow.setEnv({
      INTERNAL_CALLBACK_SECRET: 'secret-1',
      STATE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      RUNPOD_ENDPOINT: 'runner-endpoint',
      R2_PUBLIC_URL: 'https://cdn.example.com',
      GENERATION_BUCKET: { put },
    })

    const context = {
      ...makeFalImageContext({
        externalModelId: 'waiIllustriousSDXL_v150',
        aspectRatio: '1:1',
      }),
      providerId: 'runner',
      maxAttempts: 10,
      pollIntervalMs: 1,
    }
    const runResult = await workflow.run(
      { payload: context, instanceId: 'instance-1' } as never,
      {
        do: vi.fn(async (_name: string, ...args: unknown[]) => {
          const callback = args[args.length - 1] as () => Promise<unknown>
          return callback()
        }),
        sleep: vi.fn(),
      } as never,
    )

    expect(runResult).toMatchObject({ status: 'COMPLETED' })
    expect(put).toHaveBeenCalled()

    const stages = fetchMock.mock.calls
      .filter(([input]) => String(input) === 'https://cb.example.com')
      .map(([, init]) => readCallbackBody(init as RequestInit))
      .map((body) => body.data?.executionStage)
      .filter((stage) => stage !== undefined)
    expect(stages).toEqual(['runnerQueued', 'runnerRunning'])
  })
})

/**
 * Runner 幻影名额自愈（2026-09-12，owner 拍板）。
 *
 * 在此之前，判定幻影 = 直接取消出图并报 `runner_queue_stuck` —— 用户拿到的是一条
 * 「端点需要人工看一眼」的失败，而实测里真正要做的事只是把占着名额的僵尸 worker
 * 踢掉（REST `workersMax` 0 → 原值）再重排一次，端点就恢复了。这一节锁的是那条
 * 自愈路径的每一个硬约束：
 * - REST 请求形状（只能打 rest.runpod.io/v1，PATCH 只带 workersMax）；
 * - 失败也必须把 `workersMax` 恢复原值 —— 漏恢复 = 端点被永久缩到 0，比卡死更糟；
 * - 自愈只给一次，第二次幻影照旧取消（文案不变），否则一个真坏掉的端点会让
 *   同一单在回收/重排之间无限打转。
 */
const RUNNER_REST_ENDPOINT_URL =
  'https://rest.runpod.io/v1/endpoints/runner-endpoint'

interface RunnerRecycleHarnessOptions {
  /** GET /endpoints/<id> 的返回体；缺省报 workersMax=2。 */
  endpointBody?: Record<string, unknown>
  /** GET /endpoints/<id> 的状态码。 */
  endpointStatus?: number
  /** PATCH workersMax=0 的状态码（用来造「缩容失败」）。 */
  scaleDownStatus?: number
  /** 第二次轮询 /health 时是否已排空（缺省真）。 */
  drains?: boolean
}

interface RunnerRecycleHarness {
  fetchMock: ReturnType<typeof vi.fn>
  patchBodies: () => unknown[]
  patchCalls: () => RequestInit[]
  submittedJobIds: () => string[]
  cancelledJobIds: () => string[]
  stages: () => (string | undefined)[]
  callbackBodies: () => CallbackBody[]
  put: ReturnType<typeof vi.fn>
}

/**
 * 一个「永远卡在 IN_QUEUE 且 /health 报幻影签名」的端点。回收（PATCH 0）之后
 * /health 转为全 0，重排出来的第二个 job 立刻 COMPLETED。
 */
function stubRunnerRecycleEndpoint(
  options: RunnerRecycleHarnessOptions = {},
): RunnerRecycleHarness {
  const {
    endpointBody = { workersMax: 2 },
    endpointStatus = 200,
    scaleDownStatus = 200,
    drains = true,
  } = options
  const put = vi.fn().mockResolvedValue(undefined)
  let scaledDown = false
  let submitCount = 0

  const fetchMock = vi
    .fn()
    .mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'

        if (url === 'https://resolve.example.com')
          return Response.json({
            success: true,
            data: { apiKey: 'runpod-key' },
          })
        if (url === 'https://cb.example.com')
          return Response.json({ success: true })

        if (url === 'https://api.runpod.ai/v2/runner-endpoint/run') {
          submitCount += 1
          return Response.json({ id: `runpod-job-${submitCount}` })
        }
        if (
          url.startsWith('https://api.runpod.ai/v2/runner-endpoint/status/')
        ) {
          // 第一单永远排队（幻影），回收后重排的第二单立刻出图。
          if (url.endsWith('/runpod-job-1'))
            return Response.json({ status: 'IN_QUEUE' })
          return Response.json({
            status: 'COMPLETED',
            output: {
              images: [{ data: bytesToBase64(new Uint8Array([1, 2, 3])) }],
            },
          })
        }
        if (url.startsWith('https://api.runpod.ai/v2/runner-endpoint/cancel/'))
          return Response.json({ status: 'CANCELLED' })

        if (url === 'https://api.runpod.ai/v2/runner-endpoint/health') {
          // 幻影签名：声称有 worker（idle 1）却零活跃。缩容后全 0 = 排空。
          const drained = scaledDown && drains
          return Response.json({
            workers: {
              idle: drained ? 0 : 1,
              ready: 0,
              running: 0,
              initializing: 0,
              throttled: 0,
            },
          })
        }

        if (url === RUNNER_REST_ENDPOINT_URL) {
          if (method === 'GET') {
            if (endpointStatus !== 200)
              return new Response(null, { status: endpointStatus })
            return Response.json(endpointBody)
          }
          if (method === 'PATCH') {
            const body = JSON.parse(String(init?.body)) as {
              workersMax: number
            }
            if (body.workersMax === 0) {
              if (scaleDownStatus !== 200)
                return new Response(null, { status: scaleDownStatus })
              scaledDown = true
            } else {
              scaledDown = false
            }
            return Response.json({ id: 'runner-endpoint' })
          }
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      },
    )

  vi.stubGlobal('fetch', fetchMock)
  // 回收的排空轮询是 5s 一次、上限 90s。测试里把等待折叠成同步，逻辑一字不改。
  vi.stubGlobal('setTimeout', (callback: () => void) => {
    callback()
    return 0 as unknown as ReturnType<typeof setTimeout>
  })

  const restCalls = (method: string) =>
    fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input) === RUNNER_REST_ENDPOINT_URL &&
        ((init as RequestInit | undefined)?.method ?? 'GET') === method,
    )

  const callbackBodies = () =>
    fetchMock.mock.calls
      .filter(([input]) => String(input) === 'https://cb.example.com')
      .map(([, init]) => readCallbackBody(init as RequestInit))

  return {
    fetchMock,
    put,
    patchCalls: () => restCalls('PATCH').map(([, init]) => init as RequestInit),
    patchBodies: () =>
      restCalls('PATCH').map(([, init]) =>
        JSON.parse(String((init as RequestInit).body)),
      ),
    submittedJobIds: () =>
      fetchMock.mock.calls
        .filter(
          ([input]) =>
            String(input) === 'https://api.runpod.ai/v2/runner-endpoint/run',
        )
        .map((_call, index) => `runpod-job-${index + 1}`),
    cancelledJobIds: () =>
      fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((url) =>
          url.startsWith('https://api.runpod.ai/v2/runner-endpoint/cancel/'),
        )
        .map((url) => url.split('/').pop() as string),
    stages: () =>
      callbackBodies()
        .map((body) => body.data?.executionStage)
        .filter((stage) => stage !== undefined),
    callbackBodies,
  }
}

async function runRunnerImageWorkflow(
  put: ReturnType<typeof vi.fn>,
): Promise<unknown> {
  class TestWorkflow extends ImageQueueWorkflow {
    setEnv(env: unknown) {
      this.env = env as never
    }
  }
  const workflow = new TestWorkflow()
  workflow.setEnv({
    INTERNAL_CALLBACK_SECRET: 'secret-1',
    STATE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    RUNPOD_ENDPOINT: 'runner-endpoint',
    R2_PUBLIC_URL: 'https://cdn.example.com',
    GENERATION_BUCKET: { put },
  })

  const context = {
    ...makeFalImageContext({
      externalModelId: 'waiIllustriousSDXL_v150',
      aspectRatio: '1:1',
    }),
    providerId: 'runner',
    // 幻影探测每 60 攻一次、连续两次才判定 → 第 120 攻命中。留足余量到第二轮。
    maxAttempts: 300,
    pollIntervalMs: 1,
  }
  return workflow.run(
    { payload: context, instanceId: 'instance-1' } as never,
    {
      do: vi.fn(async (_name: string, ...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>
        return callback()
      }),
      sleep: vi.fn(),
    } as never,
  )
}

describe('recycleRunnerEndpointWorkers', () => {
  const env = { RUNPOD_ENDPOINT: 'runner-endpoint' } as Parameters<
    typeof recycleRunnerEndpointWorkers
  >[0]

  it('打的是 REST v1：GET 读原值 → PATCH 0 → PATCH 回原值，body 只带 workersMax', async () => {
    const harness = stubRunnerRecycleEndpoint()

    const result = await recycleRunnerEndpointWorkers(env, 'runpod-key')

    expect(result.ok).toBe(true)
    const restCalls = harness.fetchMock.mock.calls.filter(
      ([input]) => String(input) === RUNNER_REST_ENDPOINT_URL,
    )
    expect(restCalls).toHaveLength(3)
    expect((restCalls[0][1] as RequestInit | undefined)?.method ?? 'GET').toBe(
      'GET',
    )
    expect(restCalls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer runpod-key',
    })
    expect(harness.patchCalls().every((init) => init.method === 'PATCH')).toBe(
      true,
    )
    // ⛔ workersStandby 不在 PATCH schema 里（传了 400）—— body 必须只有这一个键。
    expect(harness.patchBodies()).toEqual([
      { workersMax: 0 },
      { workersMax: 2 },
    ])
  })

  it('缩容失败也把 workersMax 恢复原值，并返回失败原因（绝不抛）', async () => {
    const harness = stubRunnerRecycleEndpoint({ scaleDownStatus: 500 })

    const result = await recycleRunnerEndpointWorkers(env, 'runpod-key')

    expect(result.ok).toBe(false)
    expect(harness.patchBodies()).toEqual([
      { workersMax: 0 },
      { workersMax: 2 },
    ])
  })

  it('读不到端点（非 200）时不动 workersMax，直接报失败', async () => {
    const harness = stubRunnerRecycleEndpoint({ endpointStatus: 404 })

    const result = await recycleRunnerEndpointWorkers(env, 'runpod-key')

    expect(result).toMatchObject({ ok: false })
    expect(harness.patchBodies()).toEqual([])
  })

  it('没配端点 id 时不发任何请求', async () => {
    const harness = stubRunnerRecycleEndpoint()

    const result = await recycleRunnerEndpointWorkers(
      {} as Parameters<typeof recycleRunnerEndpointWorkers>[0],
      'runpod-key',
    )

    expect(result).toMatchObject({ ok: false })
    expect(harness.fetchMock).not.toHaveBeenCalled()
  })
})

describe('runner 幻影名额自愈（工作流）', () => {
  it('幻影 → 回收 → 重排 → 完成，阶段序列里出现 runnerRecycling', async () => {
    const harness = stubRunnerRecycleEndpoint()

    const result = await runRunnerImageWorkflow(harness.put)

    expect(result).toMatchObject({ status: 'COMPLETED' })
    expect(harness.stages()).toEqual([
      'runnerQueued',
      'runnerRecycling',
      'runnerQueued',
    ])
    // 卡住的那一单被撤掉，重排换了新 job id。
    expect(harness.cancelledJobIds()).toEqual(['runpod-job-1'])
    expect(harness.submittedJobIds()).toEqual(['runpod-job-1', 'runpod-job-2'])
    expect(harness.patchBodies()).toEqual([
      { workersMax: 0 },
      { workersMax: 2 },
    ])
    expect(harness.put).toHaveBeenCalled()
  })

  it('回收失败：workersMax 仍恢复原值，且照旧走取消 + runner_queue_stuck', async () => {
    const harness = stubRunnerRecycleEndpoint({ scaleDownStatus: 500 })

    const result = await runRunnerImageWorkflow(harness.put)

    expect(result).toMatchObject({ status: 'FAILED' })
    expect(harness.patchBodies()).toEqual([
      { workersMax: 0 },
      { workersMax: 2 },
    ])
    // 重排一次都没发生。
    expect(harness.submittedJobIds()).toEqual(['runpod-job-1'])
    const failure = harness
      .callbackBodies()
      .map((body) => JSON.stringify(body))
      .join('\n')
    expect(failure).toContain('runner_queue_stuck')
  })

  it('第二次幻影不再回收，直接取消（自愈每单只给一次）', async () => {
    // 重排出来的第二单同样卡在 IN_QUEUE，且端点恢复后 /health 又是幻影签名。
    const put = vi.fn().mockResolvedValue(undefined)
    let submitCount = 0
    let scaledDown = false
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input)
          const method = init?.method ?? 'GET'
          if (url === 'https://resolve.example.com')
            return Response.json({
              success: true,
              data: { apiKey: 'runpod-key' },
            })
          if (url === 'https://cb.example.com')
            return Response.json({ success: true })
          if (url === 'https://api.runpod.ai/v2/runner-endpoint/run') {
            submitCount += 1
            return Response.json({ id: `runpod-job-${submitCount}` })
          }
          if (
            url.startsWith('https://api.runpod.ai/v2/runner-endpoint/status/')
          )
            return Response.json({ status: 'IN_QUEUE' })
          if (
            url.startsWith('https://api.runpod.ai/v2/runner-endpoint/cancel/')
          )
            return Response.json({ status: 'CANCELLED' })
          if (url === 'https://api.runpod.ai/v2/runner-endpoint/health')
            return Response.json({
              workers: {
                idle: scaledDown ? 0 : 1,
                ready: 0,
                running: 0,
                initializing: 0,
                throttled: 0,
              },
            })
          if (url === RUNNER_REST_ENDPOINT_URL) {
            if (method === 'GET') return Response.json({ workersMax: 2 })
            const body = JSON.parse(String(init?.body)) as {
              workersMax: number
            }
            scaledDown = body.workersMax === 0
            return Response.json({ id: 'runner-endpoint' })
          }
          throw new Error(`Unexpected fetch: ${method} ${url}`)
        },
      )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('setTimeout', (callback: () => void) => {
      callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })

    const result = await runRunnerImageWorkflow(put)

    expect(result).toMatchObject({ status: 'FAILED' })
    // 只回收过一次（一对 PATCH），只重排过一次。
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === RUNNER_REST_ENDPOINT_URL &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(2)
    expect(submitCount).toBe(2)
    const cancelled = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) =>
        url.startsWith('https://api.runpod.ai/v2/runner-endpoint/cancel/'),
      )
      .map((url) => url.split('/').pop())
    // 第一单在回收前撤掉，第二单在第二次判定幻影时撤掉。
    expect(cancelled).toEqual(['runpod-job-1', 'runpod-job-2'])
    const failure = fetchMock.mock.calls
      .filter(([input]) => String(input) === 'https://cb.example.com')
      .map(([, init]) => String((init as RequestInit).body))
      .join('\n')
    expect(failure).toContain('runner_queue_stuck')
  })
})

/**
 * `generatePixAiImage` —— 队列型 A 类原生 adapter（进度表 26 切片 3）。
 * 这一组盯住四件会静默出错的事：状态机、只发 batchSize 1、比例映射、
 * **拿到结果立刻落 R2**（PixAI 的图不永久保留）。
 */
describe('generatePixAiImage', () => {
  const TSUBAKI = '1983308862240288769'

  function makeEnv() {
    return {
      GENERATION_BUCKET: { put: vi.fn().mockResolvedValue(undefined) },
      R2_PUBLIC_URL: 'https://cdn.example.com',
    } as unknown as Parameters<typeof generatePixAiImage>[0]
  }

  function makeContext(
    referenceImages?: string[],
    advancedParams?: Record<string, unknown>,
  ) {
    return {
      runId: 'run-pixai-1',
      workflowId: 'IMAGE_QUEUE',
      outputType: 'IMAGE',
      providerId: 'pixai',
      callbackUrl: 'https://cb.example.com',
      resolveKeyUrl: 'https://resolve.example.com',
      timeoutMs: 60000,
      maxAttempts: 1,
      pollIntervalMs: 2000,
      providerInput: {
        prompt: '1girl, blue hair',
        modelId: 'pixai-tsubaki-2',
        externalModelId: TSUBAKI,
        aspectRatio: '16:9',
        outputStorageKey: 'generations/u1/image/out.png',
        referenceImages,
        ...(advancedParams ? { advancedParams } : {}),
      },
    } as unknown as Parameters<typeof generatePixAiImage>[1]
  }

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  function stubPixAi(
    statuses: string[],
    options: { mediaUrls?: string[] } = {},
  ) {
    const mediaUrls = options.mediaUrls ?? ['https://pixai.example/out.png']
    const responses: Response[] = [
      jsonResponse({ id: 'task-1', status: 'waiting' }, 201),
      ...statuses.map((status) =>
        jsonResponse({
          id: 'task-1',
          status,
          outputs: status === 'completed' ? { mediaUrls } : undefined,
        }),
      ),
    ]
    let call = 0
    const fetchMock = vi.fn(async (url: unknown, init?: unknown) => {
      void init
      // 最后一次是去取图（不是 API），回二进制。
      if (call >= responses.length) {
        return new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }
      const response = responses[call]
      call += 1
      void url
      return response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    // 官方要求两次轮询至少隔 1.5s —— 用例不真等。
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: () => void,
    ) => {
      handler()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates a task, polls until completed and stores the image in R2', async () => {
    const fetchMock = stubPixAi(['running', 'completed'])
    const env = makeEnv()

    const result = await generatePixAiImage(env, makeContext(), 'pixai-key')

    const createCall = fetchMock.mock.calls[0]
    expect(String(createCall?.[0])).toBe(
      'https://api.pixai.art/v2/image/create',
    )
    const body = JSON.parse(
      String((createCall?.[1] as { body: string } | undefined)?.body),
    ) as Record<string, unknown>
    expect(body.modelVersionId).toBe(TSUBAKI)
    // 比例是逐字透传的，⛔ 没有第二张换算表。
    expect(body.aspectRatio).toBe('16:9')
    // worker 的图片结果契约是单张，所以只发 1。
    expect(body.batchSize).toBe(1)

    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://api.pixai.art/v1/task/task-1',
    )
    // 结果图立刻落 R2 —— PixAI 的 mediaUrls 会过期，⛔ 不能存它。
    expect(env.GENERATION_BUCKET.put).toHaveBeenCalledWith(
      'generations/u1/image/out.png',
      expect.anything(),
      expect.anything(),
    )
    expect(result.artifactUrl).toBe(
      'https://cdn.example.com/generations/u1/image/out.png',
    )
    expect(result.providerMetadata).toMatchObject({ pixaiTaskId: 'task-1' })
  })

  /**
   * `size` 与 `mode`（2026-09-20 官方 createImage 页核实）。⚠ 画出控件却不发字段
   * 就是一颗假旋钮 —— 这两条盯的就是「真的发出去了」。
   */
  it('sends the documented size and render mode', async () => {
    const fetchMock = stubPixAi(['completed'])
    await generatePixAiImage(
      makeEnv(),
      makeContext(undefined, { pixaiSize: '1.5k', pixaiMode: 'ultra' }),
      'pixai-key',
    )
    const body = JSON.parse(
      String(
        (fetchMock.mock.calls[0]?.[1] as { body: string } | undefined)?.body,
      ),
    ) as Record<string, unknown>
    expect(body.size).toBe('1.5k')
    expect(body.mode).toBe('ultra')
  })

  // 不设 = 不发这个字段（provider 自己的默认），⛔ 不替它编一个。
  it('omits size and mode when they are not set', async () => {
    const fetchMock = stubPixAi(['completed'])
    await generatePixAiImage(makeEnv(), makeContext(), 'pixai-key')
    const body = JSON.parse(
      String(
        (fetchMock.mock.calls[0]?.[1] as { body: string } | undefined)?.body,
      ),
    ) as Record<string, unknown>
    expect(body).not.toHaveProperty('size')
    expect(body).not.toHaveProperty('mode')
  })

  // 白名单之外的值一律不发：`mode` 在非 Tsubaki 上是 400 INVALID_ARGUMENT，
  // 表外的 `size` 同理。⛔ 不把客户端送来的任意串原样透传。
  it('drops values outside the documented sets', async () => {
    const fetchMock = stubPixAi(['completed'])
    await generatePixAiImage(
      makeEnv(),
      makeContext(undefined, { pixaiSize: '4k', pixaiMode: 'insane' }),
      'pixai-key',
    )
    const body = JSON.parse(
      String(
        (fetchMock.mock.calls[0]?.[1] as { body: string } | undefined)?.body,
      ),
    ) as Record<string, unknown>
    expect(body).not.toHaveProperty('size')
    expect(body).not.toHaveProperty('mode')
  })

  it.each(['failed', 'cancelled'])('surfaces a %s task', async (status) => {
    stubPixAi([status])

    await expect(
      generatePixAiImage(makeEnv(), makeContext(), 'pixai-key'),
    ).rejects.toThrow(`PixAI task task-1 ended as ${status}`)
  })

  it('names the 10-waiting-task cap when creation is throttled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('slow down', { status: 429 })),
    )

    await expect(
      generatePixAiImage(makeEnv(), makeContext(), 'pixai-key'),
    ).rejects.toThrow('at most 10 tasks waiting')
  })

  // 挂了参考图还硬发，PixAI 会照常出一张与它毫无关系的图 —— 静默失效。
  it('refuses a reference image instead of silently ignoring it', async () => {
    const fetchMock = stubPixAi(['completed'])

    await expect(
      generatePixAiImage(
        makeEnv(),
        makeContext(['https://example.com/ref.png']),
        'pixai-key',
      ),
    ).rejects.toThrow('text-to-image only')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an aspect ratio PixAI does not list', async () => {
    const fetchMock = stubPixAi(['completed'])
    const context = makeContext()
    context.providerInput.aspectRatio = '21:9'

    await expect(
      generatePixAiImage(makeEnv(), context, 'pixai-key'),
    ).rejects.toThrow('does not support the aspect ratio 21:9')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails loudly when a completed task carries no image', async () => {
    stubPixAi(['completed'], { mediaUrls: [] })

    await expect(
      generatePixAiImage(makeEnv(), makeContext(), 'pixai-key'),
    ).rejects.toThrow('completed without an image URL')
  })
})
