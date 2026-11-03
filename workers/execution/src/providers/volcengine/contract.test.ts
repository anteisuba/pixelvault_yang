/**
 * 火山 / BytePlus 契约测试（o-worker 第 7 步）：官方文档的示例返回喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseImageRunContext } from '../../index'
import fixtures from './contract-fixtures.json'
import { generateVolcEngineImage } from './image'
import { mapVolcEngineStatus } from './video-request-builder'
import { pollVolcEngineQueue } from './video'

afterEach(() => vi.unstubAllGlobals())

describe('火山视频契约', () => {
  it('官方列出的任务状态都能对上（取消了就别再轮询）', () => {
    expect(fixtures.videoTaskStatuses.map(mapVolcEngineStatus)).toEqual([
      'IN_QUEUE',
      'IN_PROGRESS',
      'FAILED',
      'COMPLETED',
      'FAILED',
      'FAILED',
    ])
  })

  it('成功：读出视频地址和实际种子', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(fixtures.videoTaskSucceeded)),
    )
    const queue = {
      requestId: fixtures.videoTaskSucceeded.id,
      statusUrl: 'https://ark.cn-beijing.volces.com/api/v3/tasks/x',
      responseUrl: 'https://ark.cn-beijing.volces.com/api/v3/tasks/x',
    }
    expect(await pollVolcEngineQueue(queue, 'k', 'volcengine')).toMatchObject({
      status: 'COMPLETED',
      artifactUrl: fixtures.videoTaskSucceeded.content.video_url,
      seed: fixtures.videoTaskSucceeded.seed,
    })
  })
})

describe('火山出图契约', () => {
  it('图层返回：底图取 z_index 0，图层带尺寸和框', async () => {
    const put = vi.fn(async (..._args: unknown[]) => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/images/generations')
          ? Response.json(fixtures.imageLayered)
          : new Response('pixels', {
              headers: { 'content-type': 'image/png' },
            }),
      ),
    )
    const context = parseImageRunContext({
      runId: 'job',
      workflowId: 'IMAGE_QUEUE',
      providerId: 'volcengine',
      apiKeyId: 'key',
      callbackUrl: 'https://app.example/callback',
      resolveKeyUrl: 'https://app.example/key',
      timeoutMs: 600000,
      maxAttempts: 1,
      pollIntervalMs: 3000,
      providerInput: {
        prompt: 'split layers',
        modelId: 'seedream-5-pro',
        externalModelId: fixtures.imageLayered.model,
        aspectRatio: '1:1',
        referenceImages: ['https://cdn.example/source.png'],
        advancedParams: { layerDecomposition: true },
        outputStorageKey: 'image/result.png',
      },
    })!
    const env = {
      R2_PUBLIC_URL: 'https://cdn.example',
      GENERATION_BUCKET: { put },
    } as unknown as Parameters<typeof generateVolcEngineImage>[0]

    const result = await generateVolcEngineImage(env, context, 'k')

    expect(result).toMatchObject({ width: 2048, height: 2048 })
    expect(result.layers).toEqual([
      expect.objectContaining({
        zIndex: 1,
        width: 1273,
        height: 265,
        name: 'Seedream title',
      }),
    ])
    expect(put).toHaveBeenCalledTimes(2)
  })
})
