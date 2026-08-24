import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildFalImageInput,
  computeTieredDimensions,
  getImageReferenceInputs,
  createSignedRequestHeaders,
  decryptStateString,
  encryptStateString,
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
