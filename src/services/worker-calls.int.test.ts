/**
 * L2a 真库：两个找执行 Worker 帮忙的服务——取消生成（generation-cancel.service）、
 * 认图打标签（image-tagger.service）。只假 Worker（fetch）；库全真。
 * 核库里的任务状态 / 作品 snapshot 与发给 Worker 的请求。
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import { EXECUTION_WORKER } from '@/constants/execution'
import { IMAGE_TAGGER } from '@/constants/image-tagger'
import { db } from '@/lib/db'
import { cancelGenerationJobs } from '@/services/generation-cancel.service'
import { tagPicture } from '@/services/image-tagger.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

const WORKER = 'https://worker.test'
const worker = vi.hoisted(() => ({
  status: 200,
  reply: {} as unknown,
  requests: [] as Array<{ path: string; body: unknown }>,
}))

beforeAll(() => {
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-internal-secret-not-real')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  worker.status = 200
  worker.reply = { ok: true }
  worker.requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if (url.origin !== WORKER) return new Response('nope', { status: 404 })
      worker.requests.push({
        path: url.pathname,
        body: JSON.parse(String(init?.body ?? 'null')),
      })
      return worker.status === 200
        ? Response.json(worker.reply)
        : new Response('down', { status: worker.status })
    }),
  )
})

function seedJob(
  userId: string,
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED',
) {
  return db.generationJob.create({
    data: {
      userId,
      adapterType: 'fal',
      provider: 'fal',
      modelId: 'm',
      status,
      providerJobId: status === 'RUNNING' ? 'fal_req_1' : null,
    },
  })
}

describe('cancelGenerationJobs（真库，假 Worker）', () => {
  it('在跑 / 排队的取消并通知 Worker；做完的、别人的、没有的分开回', async () => {
    const running = await seedJob(me.id, 'RUNNING')
    const queued = await seedJob(me.id, 'QUEUED')
    const done = await seedJob(me.id, 'COMPLETED')
    const theirs = await seedJob(other.id, 'RUNNING')

    const result = await cancelGenerationJobs(me.clerkId, [
      running.id,
      queued.id,
      done.id,
      theirs.id,
      'missing',
    ])
    expect(result.cancelled.sort()).toEqual([running.id, queued.id].sort())
    expect(result.alreadyFinished).toEqual([done.id])
    expect(result.notFound.sort()).toEqual([theirs.id, 'missing'].sort())

    const status = async (id: string) =>
      (await db.generationJob.findUniqueOrThrow({ where: { id } })).status
    expect(await status(running.id)).toBe('CANCELLED')
    expect(await status(queued.id)).toBe('CANCELLED')
    expect(await status(done.id)).toBe('COMPLETED')
    expect(await status(theirs.id)).toBe('RUNNING')

    expect(
      worker.requests.every((r) => r.path === EXECUTION_WORKER.CANCEL_PATH),
    ).toBe(true)
    expect(worker.requests.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        {
          jobId: running.id,
          workflowInstanceId: running.id,
          provider: 'fal',
          providerJobId: 'fal_req_1',
        },
        { jobId: queued.id, workflowInstanceId: queued.id, provider: 'fal' },
      ]),
    )
  })

  it('Worker 挂了：库里照样取消（通知只是尽力而为）', async () => {
    worker.status = 500
    const running = await seedJob(me.id, 'RUNNING')
    expect(await cancelGenerationJobs(me.clerkId, [running.id])).toEqual({
      cancelled: [running.id],
      alreadyFinished: [],
      notFound: [],
    })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: running.id } }))
        .status,
    ).toBe('CANCELLED')
  })
})

describe('tagPicture（真库，假 Worker）', () => {
  const RESULT = {
    style: [],
    character: [['denia_(fire_emblem)', 0.91]],
    copyright: [],
    general: [['1girl', 0.99]],
    meta: [],
    rating: [['general', 0.8]],
  }

  it('库里的图：问一次 Worker，结果存进 snapshot；再问直接读库', async () => {
    const gen = await seedGeneration(me.id, {
      url: 'https://cdn.test/a.png',
      snapshot: { keep: 'me' },
    })
    worker.reply = RESULT
    expect(await tagPicture(me.id, gen.url)).toEqual(RESULT)
    expect(worker.requests).toEqual([
      { path: EXECUTION_WORKER.TAG_IMAGE_PATH, body: { imageUrl: gen.url } },
    ])
    const snapshot = (
      await db.generation.findUniqueOrThrow({ where: { id: gen.id } })
    ).snapshot as Record<string, { version: string; result: unknown }>
    expect(snapshot.keep).toBe('me')
    expect(snapshot[IMAGE_TAGGER.SNAPSHOT_KEY]).toMatchObject({
      version: IMAGE_TAGGER.MODEL_VERSION,
      result: RESULT,
    })

    expect(await tagPicture(me.id, gen.url)).toEqual(RESULT)
    expect(worker.requests).toHaveLength(1)
  })

  it('别人的图不读不写；外站 https 图照样认但不存；非 https 直接抛', async () => {
    const theirs = await seedGeneration(other.id, {
      url: 'https://cdn.test/b.png',
    })
    worker.reply = RESULT
    expect(await tagPicture(me.id, theirs.url)).toEqual(RESULT)
    expect(
      (await db.generation.findUniqueOrThrow({ where: { id: theirs.id } }))
        .snapshot,
    ).toBeNull()

    await expect(
      tagPicture(me.id, 'http://insecure.test/a.png'),
    ).rejects.toThrow('Only https pictures can be tagged.')
    expect(worker.requests).toHaveLength(1)
  })

  it('Worker 认不出：抛错，不往库里写', async () => {
    const gen = await seedGeneration(me.id, { url: 'https://cdn.test/c.png' })
    worker.status = 502
    await expect(tagPicture(me.id, gen.url)).rejects.toThrow(
      'Tagger failed (502)',
    )
    expect(
      (await db.generation.findUniqueOrThrow({ where: { id: gen.id } }))
        .snapshot,
    ).toBeNull()
  })
})
