/**
 * OpenAI 出图契约测试（o-worker 第 7 步）：官方 Images API 的示例返回（普通 + 流式）喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseImageRunContext } from '../../index'
import fixtures from './contract-fixtures.json'
import { generateOpenAIImage } from './image'

afterEach(() => vi.unstubAllGlobals())

function run(
  body: BodyInit,
  preview: boolean,
  options: { advancedParams?: Record<string, unknown>; status?: number } = {},
) {
  const put = vi.fn(async (..._args: unknown[]) => undefined)
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(body, { status: options.status ?? 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const context = parseImageRunContext({
    runId: 'job',
    workflowId: 'IMAGE_QUEUE',
    providerId: 'openai',
    apiKeyId: 'key',
    callbackUrl: 'https://app.example/callback',
    resolveKeyUrl: 'https://app.example/key',
    timeoutMs: 600000,
    maxAttempts: 1,
    pollIntervalMs: 3000,
    providerInput: {
      prompt: 'A cute baby sea otter',
      modelId: 'gpt-image-2',
      externalModelId: 'gpt-image-2',
      aspectRatio: '1:1',
      advancedParams: {
        ...(preview ? { preview: true } : {}),
        ...options.advancedParams,
      },
      outputStorageKey: 'image/result.png',
    },
  })!
  const env = {
    R2_PUBLIC_URL: 'https://cdn.example',
    GENERATION_BUCKET: { put },
  } as unknown as Parameters<typeof generateOpenAIImage>[0]
  return { promise: generateOpenAIImage(env, context, 'k'), put, fetchMock }
}

describe('OpenAI 出图契约', () => {
  it('普通返回：b64_json 落 R2', async () => {
    const { promise, put } = run(JSON.stringify(fixtures.generation), false)
    expect(await promise).toMatchObject({ imageR2Key: 'image/result.png' })
    expect(put).toHaveBeenCalledWith(
      'image/result.png',
      expect.any(Uint8Array),
      expect.anything(),
    )
  })

  it('流式返回：预览图和成图都落 R2', async () => {
    const { promise, put } = run(fixtures.stream, true)
    expect(await promise).toMatchObject({ imageR2Key: 'image/result.png' })
    expect(put.mock.calls.map((call) => call[0])).toEqual([
      'image/previews/job/0.png',
      'image/result.png',
    ])
  })

  it('GIF：带帧参数、不流式、按每帧最小尺寸请求，存 .gif 且宽高读文件头', async () => {
    // GIF89a，逻辑屏幕 816×816
    const gif = new Uint8Array([
      71, 73, 70, 56, 57, 97, 0x30, 0x03, 0x30, 0x03, 0, 0, 0,
    ])
    const b64 = btoa(String.fromCharCode(...gif))
    const { promise, put, fetchMock } = run(
      JSON.stringify({ data: [{ b64_json: b64 }] }),
      true,
      {
        advancedParams: {
          outputFormat: 'gif',
          gifFrameCount: '16',
          gifFrameDuration: '100',
          resolution: '4K',
        },
      },
    )
    expect(await promise).toMatchObject({
      imageR2Key: 'image/result.gif',
      mimeType: 'image/gif',
      width: 816,
      height: 816,
    })
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent).toMatchObject({
      output_format: 'gif',
      frame_count: 16,
      frame_duration_ms: 100,
      size: '816x816',
    })
    expect(sent.stream).toBeUndefined()
    expect(put).toHaveBeenCalledWith(
      'image/result.gif',
      expect.any(Uint8Array),
      expect.objectContaining({
        httpMetadata: expect.objectContaining({ contentType: 'image/gif' }),
      }),
    )
  })

  it('GIF 超像素额度的 400 改写成固定句首，app 侧认成「帧数太多」', async () => {
    const { promise } = run(
      JSON.stringify({
        error: { message: 'Requested frames exceed the total pixel limit.' },
      }),
      false,
      { advancedParams: { outputFormat: 'gif' }, status: 400 },
    )
    await expect(promise).rejects.toThrow(
      /^GIF frames exceed the request pixel budget: /,
    )
  })

  it('非 GIF 请求不带帧参数', async () => {
    const { promise, fetchMock } = run(
      JSON.stringify(fixtures.generation),
      false,
      { advancedParams: { gifFrameCount: '16' } },
    )
    await promise
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent.output_format).toBe('png')
    expect(sent.frame_count).toBeUndefined()
  })
})
