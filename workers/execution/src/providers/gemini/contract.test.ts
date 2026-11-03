/**
 * Gemini 出图契约测试（o-worker 第 7 步）：按官方 generateContent 参考页的字段拼的返回喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseImageRunContext } from '../../index'
import fixtures from './contract-fixtures.json'
import { generateGeminiImage } from './image'
import { pollGeminiVideoQueue } from './video'

afterEach(() => vi.unstubAllGlobals())

function run(payload: unknown) {
  const put = vi.fn(async (..._args: unknown[]) => undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(payload)),
  )
  const context = parseImageRunContext({
    runId: 'job',
    workflowId: 'IMAGE_QUEUE',
    providerId: 'gemini',
    apiKeyId: 'key',
    callbackUrl: 'https://app.example/callback',
    resolveKeyUrl: 'https://app.example/key',
    timeoutMs: 600000,
    maxAttempts: 1,
    pollIntervalMs: 3000,
    providerInput: {
      prompt: 'a cat',
      modelId: 'gemini-image',
      externalModelId: 'gemini-3-pro-image-preview',
      aspectRatio: '1:1',
      outputStorageKey: 'image/result.png',
    },
  })!
  const env = {
    R2_PUBLIC_URL: 'https://cdn.example',
    GENERATION_BUCKET: { put },
  } as unknown as Parameters<typeof generateGeminiImage>[0]
  return { promise: generateGeminiImage(env, context, 'k'), put }
}

describe('Gemini 出图契约', () => {
  it('inlineData 图片落 R2', async () => {
    const { promise, put } = run(fixtures.imageReturned)
    expect(await promise).toMatchObject({ mimeType: 'image/png' })
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('成图被安全拦下：判 content_filtered，带官方说明', async () => {
    await expect(run(fixtures.outputBlocked).promise).rejects.toMatchObject({
      errorCode: 'content_filtered',
      message: 'Unable to show the generated image.',
    })
  })

  it('提示词被拦：判 content_filtered', async () => {
    await expect(run(fixtures.promptBlocked).promise).rejects.toMatchObject({
      errorCode: 'content_filtered',
    })
  })
})

describe('Gemini 视频文件契约', () => {
  const queue = {
    requestId: 'files/abc123',
    statusUrl: fixtures.videoFileActive.uri,
    responseUrl: fixtures.videoFileActive.downloadUri,
  }
  const poll = (file: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(file)),
    )
    return pollGeminiVideoQueue(queue, 'k')
  }

  it('官方列出的文件状态都能对上', async () => {
    const statuses = []
    for (const state of fixtures.videoFileStates) {
      statuses.push(
        (await poll({ ...fixtures.videoFileActive, state, error: undefined }))
          .status,
      )
    }
    expect(statuses).toEqual([
      'IN_PROGRESS',
      'IN_PROGRESS',
      'COMPLETED',
      'FAILED',
    ])
  })

  it('失败：带出官方给的原因', async () => {
    expect((await poll(fixtures.videoFileFailed)).error).toContain(
      'Internal error while processing video.',
    )
  })
})
