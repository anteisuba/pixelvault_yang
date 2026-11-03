/**
 * OpenAI 出图契约测试（o-worker 第 7 步）：官方 Images API 的示例返回（普通 + 流式）喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseImageRunContext } from '../../index'
import fixtures from './contract-fixtures.json'
import { generateOpenAIImage } from './image'

afterEach(() => vi.unstubAllGlobals())

function run(body: BodyInit, preview: boolean) {
  const put = vi.fn(async (..._args: unknown[]) => undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body)),
  )
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
      advancedParams: preview ? { preview: true } : {},
      outputStorageKey: 'image/result.png',
    },
  })!
  const env = {
    R2_PUBLIC_URL: 'https://cdn.example',
    GENERATION_BUCKET: { put },
  } as unknown as Parameters<typeof generateOpenAIImage>[0]
  return { promise: generateOpenAIImage(env, context, 'k'), put }
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
})
