/**
 * fal 契约测试（o-worker 第 7 步）：拿 fal 官方给的返回样本喂我们的解析代码。
 *
 * 样本在 `contract-fixtures/`：`_queue.json` 是队列文档的示例，其余每个模型一份，
 * 由 `scripts/refresh-fal-contracts.mjs` 从官方 OpenAPI 的示例值拼出来。
 * fal 改了返回长相 → 重跑脚本 → 这里变红。有了真实返回可以直接替换 `output`。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { pollFalImageQueue } from './image'
import { readFalModel3DResult } from './model-3d'
import { pollFalQueue } from './queue'

interface ModelFixture {
  endpointId: string
  requiredOutputFields: string[]
  output: Record<string, unknown>
}

const fixtureDir = join(__dirname, 'contract-fixtures')
const queueFixture = JSON.parse(
  readFileSync(join(fixtureDir, '_queue.json'), 'utf8'),
) as Record<string, Record<string, unknown>>
const modelFixtures = readdirSync(fixtureDir)
  .filter((file) => file.endsWith('.json') && !file.startsWith('_'))
  .map(
    (file) =>
      JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as ModelFixture,
  )

function kindOf(fixture: ModelFixture): 'image' | 'video' | 'model3d' {
  const keys = Object.keys(fixture.output)
  if (keys.includes('video')) return 'video'
  if (keys.some((key) => key.startsWith('model_'))) return 'model3d'
  return 'image'
}

const queue = {
  requestId: String(queueFixture.submit.request_id),
  statusUrl: String(queueFixture.submit.status_url),
  responseUrl: String(queueFixture.submit.response_url),
}

function stubQueue(status: Record<string, unknown>, result?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === queue.statusUrl) return Response.json(status)
      if (url === queue.responseUrl) return Response.json(result)
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('fal 契约：队列状态', () => {
  it.each([
    ['statusInQueue', 'IN_QUEUE'],
    ['statusInProgress', 'IN_PROGRESS'],
  ])('%s 读成还在跑', async (key, expected) => {
    stubQueue(queueFixture[key])
    expect((await pollFalImageQueue(queue, 'k')).status).toBe(expected)
    stubQueue(queueFixture[key])
    expect((await pollFalQueue(queue, 'k', 'VIDEO')).status).toBe(expected)
  })
})

describe('fal 契约：每个模型的结果返回', () => {
  it('样本覆盖了出图、视频、3D', () => {
    const kinds = new Set(modelFixtures.map(kindOf))
    expect(kinds).toEqual(new Set(['image', 'video', 'model3d']))
  })

  const byKind = (kind: ReturnType<typeof kindOf>) =>
    modelFixtures
      .filter((fixture) => kindOf(fixture) === kind)
      .map((fixture) => [fixture.endpointId, fixture] as const)

  it.each(byKind('image'))('%s 出图能读出图片地址', async (_, fixture) => {
    stubQueue(queueFixture.statusCompleted, fixture.output)
    const result = await pollFalImageQueue(queue, 'k')
    const images = (fixture.output.images ?? [fixture.output.image]) as {
      url: string
    }[]
    expect(result).toMatchObject({
      status: 'COMPLETED',
      imageUrl: images[0].url,
    })
    if (typeof fixture.output.seed === 'number') {
      expect(result.providerMetadata?.seed).toBe(fixture.output.seed)
    }
  })

  it.each(byKind('video'))('%s 视频能读出视频地址', async (_, fixture) => {
    stubQueue(queueFixture.statusCompleted, fixture.output)
    const result = await pollFalQueue(queue, 'k', 'VIDEO')
    const video = fixture.output.video as { url: string }
    expect(result).toMatchObject({
      status: 'COMPLETED',
      artifactUrl: video.url,
    })
    if (typeof fixture.output.seed === 'number') {
      expect(result.seed).toBe(fixture.output.seed)
    }
  })

  it.each(byKind('model3d'))('%s 3D 能读出模型地址', (_, fixture) => {
    expect(readFalModel3DResult(fixture.output).artifactUrl).toEqual(
      expect.stringMatching(/^https:\/\//),
    )
  })
})
