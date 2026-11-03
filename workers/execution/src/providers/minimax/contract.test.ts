/**
 * MiniMax 视频契约测试（o-worker 第 7 步）：官方 v2 OpenAPI 的示例返回喂解析代码。
 * 样本见 `contract-fixtures.json`；有真实返回时直接替换。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import fixtures from './contract-fixtures.json'
import { mapMiniMaxStatus } from './video-request-builder'
import { pollMiniMaxQueue } from './video'

const queue = {
  requestId: fixtures.submit.task_id,
  statusUrl: `https://api.minimax.io/v2/query/video_generation/${fixtures.submit.task_id}`,
  responseUrl: `https://api.minimax.io/v2/query/video_generation/${fixtures.submit.task_id}`,
}

function stubQuery(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body)),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('MiniMax 契约', () => {
  it('官方列出的任务状态都能对上', () => {
    expect(fixtures.taskStatuses.map(mapMiniMaxStatus)).toEqual([
      'IN_QUEUE',
      'IN_PROGRESS',
      'COMPLETED',
      'FAILED',
      'FAILED',
    ])
  })

  it('成功：读出视频地址', async () => {
    stubQuery(fixtures.querySucceeded)
    expect(await pollMiniMaxQueue(queue, 'k', 'minimax')).toMatchObject({
      status: 'COMPLETED',
      artifactUrl: fixtures.querySucceeded.task.content.url,
    })
  })

  it('失败：带出服务商的原因和错误码', async () => {
    stubQuery(fixtures.queryFailed)
    expect(await pollMiniMaxQueue(queue, 'k', 'minimax')).toMatchObject({
      status: 'FAILED',
      error: 'video description contains sensitive content',
      errorCode: 'content_filtered',
    })
  })
})
