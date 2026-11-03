/**
 * PixAI 契约测试（o-worker 第 7 步）：官方文档的建任务示例 + Get a task 字段说明拼的返回喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseImageRunContext } from '../../index'
import fixtures from './contract-fixtures.json'
import { generatePixAiImage } from './image'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function run(task: unknown) {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 })
  const put = vi.fn(async (..._args: unknown[]) => undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/v2/image/create'))
        return Response.json(fixtures.created)
      if (url.includes('/task/')) return Response.json(task)
      return new Response('pixels', {
        headers: { 'content-type': 'image/png' },
      })
    }),
  )
  const context = parseImageRunContext({
    runId: 'job',
    workflowId: 'IMAGE_QUEUE',
    providerId: 'pixai',
    apiKeyId: 'key',
    callbackUrl: 'https://app.example/callback',
    resolveKeyUrl: 'https://app.example/key',
    timeoutMs: 600000,
    maxAttempts: 1,
    pollIntervalMs: 3000,
    providerInput: {
      prompt: '1girl',
      modelId: 'pixai-tsubaki',
      externalModelId: '1648918127446573124',
      aspectRatio: '1:1',
      outputStorageKey: 'image/result.png',
    },
  })!
  const env = {
    R2_PUBLIC_URL: 'https://cdn.example',
    GENERATION_BUCKET: { put },
  } as unknown as Parameters<typeof generatePixAiImage>[0]
  return { promise: generatePixAiImage(env, context, 'k'), put }
}

describe('PixAI 契约', () => {
  it('完成：落 R2 并带回实际种子', async () => {
    const { promise, put } = run(fixtures.completed)
    const result = await promise
    expect(put).toHaveBeenCalledTimes(1)
    expect(result.providerMetadata).toMatchObject({
      pixaiTaskId: fixtures.created.id,
      seed: 2840367731,
    })
  })

  it('失败：带出官方给的原因', async () => {
    const { promise } = run(fixtures.failed)
    await expect(promise).rejects.toThrow('ended as failed: Task failed')
  })
})
