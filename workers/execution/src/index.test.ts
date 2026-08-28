import { deflateRawSync } from 'node:zlib'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildFalImageInput,
  bytesToBase64,
  computeTieredDimensions,
  getImageReferenceInputs,
  createSignedRequestHeaders,
  decryptStateString,
  encryptStateString,
  generateNovelAiImage,
  hexToBytes,
  isCallbackKind,
  isImageResolutionTier,
  isLongVideoPipelineWorkflowId,
  isModel3DWorkflowId,
  isWorkerWorkflowId,
  parseLongVideoPipelineRunContext,
  parseModel3DRunContext,
  parseWorkerRunContext,
  pollAndPersistRunnerImageJob,
  resolveFalImageModelId,
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

  it('leaves other models alone', () => {
    expect(
      resolveFalImageModelId(
        makeFalImageContext({
          externalModelId: 'fal-ai/flux-2/flash',
          referenceImages: ['https://cdn/ref.png'],
        }),
      ),
    ).toBe('fal-ai/flux-2/flash')
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

  it('keeps pure text-to-image models free of reference fields', () => {
    const input = buildFalImageInput(
      makeFalImageContext({
        externalModelId: 'fal-ai/flux-2/flash',
        referenceImages: ['https://cdn/ref.png'],
        advancedParams: { referenceStrength: 0.7 },
      }),
    )

    expect(input.image_url).toBeUndefined()
  })
})
