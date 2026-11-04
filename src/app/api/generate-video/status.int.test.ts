/**
 * L2a 真库：生成任务的轮询接口——音频 / 视频 / 多视角（/api/generate-*\/status）。
 * 只假 Clerk 登录与限流；服务与库全真。核库里的任务行与返回值：
 * 别人的任务一律 404；跑太久没回执的在轮询时就地收成失败。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import { GET as AUDIO_STATUS } from '@/app/api/generate-audio/status/route'
import { GET as VIDEO_STATUS } from '@/app/api/generate-video/status/route'
import { GET as MULTIVIEW_STATUS } from '@/app/api/generate-multiview/status/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }
type JobStatus = {
  jobId: string
  status: string
  generation?: { id: string }
  errorCode?: string
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

type JobExtra = {
  status?: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  generationId?: string
  startedAt?: Date
  errorMessage?: string
  externalRequestId?: string
}

function seedJob(userId: string, extra: JobExtra = {}) {
  return db.generationJob.create({
    data: {
      userId,
      adapterType: 'fal',
      provider: 'fal',
      modelId: 'test-model',
      ...extra,
    },
  })
}

const routes = [
  ['audio', AUDIO_STATUS, '/api/generate-audio/status', 'AUDIO'],
  ['video', VIDEO_STATUS, '/api/generate-video/status', 'VIDEO'],
] as const

describe.each(routes)(
  'GET %s status（真库）',
  (_name, GET, path, outputType) => {
    const poll = async (jobId?: string) => {
      const res = await GET(createGET(path, jobId ? { jobId } : undefined))
      return {
        status: res.status,
        body: await parseJSON<Envelope<JobStatus>>(res),
      }
    }

    it('做完了：回库里那张作品', async () => {
      const gen = await seedGeneration(me.id, { outputType })
      const job = await seedJob(me.id, {
        status: 'COMPLETED',
        generationId: gen.id,
      })
      const res = await poll(job.id)
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        jobId: job.id,
        status: 'COMPLETED',
        generation: { id: gen.id },
      })
    })

    it('失败 / 取消：照库里的状态回', async () => {
      const failed = await seedJob(me.id, {
        status: 'FAILED',
        errorMessage: 'provider exploded',
      })
      const cancelled = await seedJob(me.id, { status: 'CANCELLED' })
      expect((await poll(failed.id)).body.data).toMatchObject({
        status: 'FAILED',
      })
      expect((await poll(cancelled.id)).body.data).toEqual({
        jobId: cancelled.id,
        status: 'CANCELLED',
      })
    })

    it('跑了一个多小时没回执：轮询时就地收成失败并落库', async () => {
      const stale = await seedJob(me.id, {
        status: 'RUNNING',
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })
      const res = await poll(stale.id)
      expect(res.body.data).toMatchObject({
        status: 'FAILED',
        errorCode: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
      })
      expect(
        (await db.generationJob.findUniqueOrThrow({ where: { id: stale.id } }))
          .status,
      ).toBe('FAILED')
    })

    it('别人的 / 没有的任务 404；没给 jobId 400；没登录 401', async () => {
      const theirs = await seedJob(other.id, { status: 'CANCELLED' })
      expect((await poll(theirs.id)).status).toBe(404)
      expect((await poll('missing')).status).toBe(404)
      expect((await poll()).status).toBe(400)
      mockUnauthenticated()
      expect((await poll(theirs.id)).status).toBe(401)
    })
  },
)

describe('GET /api/generate-multiview/status（真库）', () => {
  const meta = (batchId: string, angle: string) =>
    JSON.stringify({
      outputType: 'IMAGE',
      multiViewBatchId: batchId,
      multiViewAngle: angle,
    })
  const poll = async (batchId: string, jobIds: string[]) => {
    const res = await MULTIVIEW_STATUS(
      createGET('/api/generate-multiview/status', {
        batchId,
        jobIds: jobIds.join(','),
      }),
    )
    return {
      status: res.status,
      body: await parseJSON<
        Envelope<{
          batchId: string
          status: string
          views: Array<{ view?: string }>
          jobs: Array<{ jobId: string; status: string; view: string }>
        }>
      >(res),
    }
  }

  it('一张做完、一张失败：整批算完成，只回做完那张的视角', async () => {
    const gen = await seedGeneration(me.id)
    const back = await seedJob(me.id, {
      status: 'COMPLETED',
      generationId: gen.id,
      externalRequestId: meta('b1', 'back'),
    })
    const left = await seedJob(me.id, {
      status: 'FAILED',
      errorMessage: 'nope',
      externalRequestId: meta('b1', 'left'),
    })
    const res = await poll('b1', [back.id, left.id])
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      batchId: 'b1',
      status: 'COMPLETED',
      jobs: [
        { jobId: back.id, view: 'back', status: 'COMPLETED' },
        { jobId: left.id, view: 'left', status: 'FAILED' },
      ],
    })
    expect(res.body.data!.views).toHaveLength(1)
  })

  it('还有一张在跑：整批 IN_PROGRESS', async () => {
    const running = await seedJob(me.id, {
      status: 'RUNNING',
      startedAt: new Date(),
      externalRequestId: meta('b2', 'right'),
    })
    expect((await poll('b2', [running.id])).body.data).toMatchObject({
      status: 'IN_PROGRESS',
      views: [],
    })
  })

  it('别人的任务、批次对不上 404；没登录 401', async () => {
    const theirs = await seedJob(other.id, {
      status: 'FAILED',
      externalRequestId: meta('b3', 'back'),
    })
    const mine = await seedJob(me.id, {
      status: 'FAILED',
      externalRequestId: meta('b3', 'back'),
    })
    expect((await poll('b3', [mine.id, theirs.id])).status).toBe(404)
    expect((await poll('other-batch', [mine.id])).status).toBe(404)
    mockUnauthenticated()
    expect((await poll('b3', [mine.id])).status).toBe(401)
  })
})
