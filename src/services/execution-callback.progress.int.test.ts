/**
 * L2a 真库：执行 Worker 的 ping / status 回执，和终态任务上的迟到回执。
 * 核任务行上的 providerJobId 与队列元数据（流式预览 / 执行阶段 / 先搜再画的来源）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import type { GenerationJobStatus } from '@/lib/generated/prisma/client'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedJob, sendCallback } from '@/test/int/execution-callback'

let me: Awaited<ReturnType<typeof createTestUser>>

const reload = (id: string) =>
  db.generationJob.findUniqueOrThrow({ where: { id } })

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

describe('handleExecutionCallback · ping / status', () => {
  it('找不到这条任务：404 EXECUTION_RUN_NOT_FOUND', async () => {
    await expect(sendCallback('missing-job', 'ping')).rejects.toMatchObject({
      errorCode: 'EXECUTION_RUN_NOT_FOUND',
      httpStatus: 404,
    })
  })

  it.each(['ping', 'status'] as const)(
    '%s：只记一笔，任务状态不动',
    async (kind) => {
      const job = await seedJob(me.id)

      await expect(sendCallback(job.id, kind)).resolves.toEqual({
        runId: job.id,
        jobStatus: 'RUNNING',
        action: 'logged',
      })
      expect(await reload(job.id)).toMatchObject({
        status: 'RUNNING',
        providerJobId: null,
        externalRequestId: null,
      })
    },
  )

  it('status 带 providerJobId：记到任务上', async () => {
    const job = await seedJob(me.id)

    await sendCallback(job.id, 'status', { providerJobId: 'fal-req-123' })

    expect((await reload(job.id)).providerJobId).toBe('fal-req-123')
  })

  it('providerJobId 是空串（校验不过）：不写', async () => {
    const job = await seedJob(me.id)

    await sendCallback(job.id, 'status', { providerJobId: '' })

    expect((await reload(job.id)).providerJobId).toBeNull()
  })

  it('出图任务的流式预览：并进原有元数据，未知字段不丢', async () => {
    const metadata = { outputType: 'IMAGE', futureField: { keep: true } }
    const job = await seedJob(me.id, { metadata })

    await sendCallback(job.id, 'status', {
      previewUrl: 'https://cdn.example.com/partial.png',
    })

    expect(JSON.parse((await reload(job.id)).externalRequestId!)).toEqual({
      ...metadata,
      previewUrl: 'https://cdn.example.com/partial.png',
    })
  })

  it('Worker 报的执行阶段（排队等 GPU / 正在出图）：并进元数据，已有预览不丢', async () => {
    const metadata = {
      outputType: 'IMAGE',
      previewUrl: 'https://cdn.example.com/partial.png',
    }
    const job = await seedJob(me.id, { status: 'QUEUED', metadata })

    await sendCallback(job.id, 'status', { executionStage: 'runnerRunning' })

    expect(JSON.parse((await reload(job.id)).externalRequestId!)).toEqual({
      ...metadata,
      executionStage: 'runnerRunning',
    })
  })

  it('先搜再画的来源暂放在任务上，等发起者轮询时取走', async () => {
    const metadata = { outputType: 'IMAGE', creditCost: 1 }
    const job = await seedJob(me.id, { metadata })
    const searchGrounding = {
      status: 'grounded',
      sources: [
        {
          kind: 'image',
          url: 'https://example.com/page',
          title: 'Page',
          domain: 'example.com',
        },
      ],
      suggestionsHtml: '<div>s</div>',
    }

    await sendCallback(job.id, 'status', { searchGrounding })

    expect(JSON.parse((await reload(job.id)).externalRequestId!)).toEqual({
      ...metadata,
      searchGrounding,
    })
  })
})

describe('handleExecutionCallback · 任务已到终态', () => {
  it.each([
    ['COMPLETED', 'status'],
    ['CANCELLED', 'status'],
    ['CANCELLED', 'ping'],
    ['COMPLETED', 'result'],
    ['FAILED', 'result'],
    // Worker 尽力取消没赶上：结果回来时任务已取消，⛔ 抛 500、⛔ 落作品。
    ['CANCELLED', 'result'],
  ] as const)(
    '%s 的任务收到 %s：ignored-terminal，一行不写',
    async (status: GenerationJobStatus, kind) => {
      const job = await seedJob(me.id, {
        status,
        metadata: { outputType: 'IMAGE' },
      })

      await expect(
        sendCallback(job.id, kind, {
          providerJobId: 'fal-req-123',
          previewUrl: 'https://cdn.example.com/late.png',
          artifactUrl: 'https://provider.example.com/video.mp4',
          requestCount: 1,
        }),
      ).resolves.toEqual({
        runId: job.id,
        jobStatus: status,
        action: 'ignored-terminal',
      })

      expect(await reload(job.id)).toMatchObject({
        status,
        providerJobId: null,
        externalRequestId: JSON.stringify({ outputType: 'IMAGE' }),
      })
      expect(await db.generation.count()).toBe(0)
      expect(await db.apiUsageLedger.count()).toBe(0)
    },
  )
})
