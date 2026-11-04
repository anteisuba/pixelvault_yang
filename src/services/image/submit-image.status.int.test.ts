/**
 * L2a 真库：出图任务的状态轮询（`checkImageGenerationStatus` / `waitForImageGenerationResult`）。
 * 任务行、作品行直接落库；完成那条走真回执服务。核返回值与任务行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  checkImageGenerationStatus,
  waitForImageGenerationResult,
} from '@/services/image/submit-image.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

let me: Awaited<ReturnType<typeof createTestUser>>

function seedJob(
  data: Partial<{
    userId: string
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
    generationId: string
    errorMessage: string
    externalRequestId: string
    startedAt: Date
  }> = {},
) {
  return db.generationJob.create({
    data: {
      userId: me.id,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      provider: 'openai',
      modelId: 'gpt-image-2',
      status: 'RUNNING',
      startedAt: new Date(),
      ...data,
    },
  })
}

const SEARCH = {
  status: 'grounded',
  sources: [
    {
      kind: 'web',
      url: 'https://example.com/a',
      title: 'example.com',
      domain: 'example.com',
    },
  ],
  suggestionsHtml: '<div>s</div>',
}

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

afterEach(() => vi.restoreAllMocks())

describe('checkImageGenerationStatus', () => {
  it('出好了：交回那张图', async () => {
    const generation = await seedGeneration(me.id)
    const job = await seedJob({
      status: 'COMPLETED',
      generationId: generation.id,
    })

    const result = await checkImageGenerationStatus(me.clerkId, job.id)

    expect(result).toMatchObject({
      jobId: job.id,
      status: 'COMPLETED',
      generation: { id: generation.id, url: generation.url },
    })
    expect(result).not.toHaveProperty('searchGrounding')
  })

  it('先搜再画的来源只交一次：带出来并从任务行上清掉', async () => {
    const generation = await seedGeneration(me.id)
    const job = await seedJob({
      status: 'COMPLETED',
      generationId: generation.id,
      externalRequestId: JSON.stringify({
        outputType: 'IMAGE',
        creditCost: 1,
        searchGrounding: SEARCH,
      }),
    })

    const first = await checkImageGenerationStatus(me.clerkId, job.id)
    const second = await checkImageGenerationStatus(me.clerkId, job.id)

    expect(first).toMatchObject({
      status: 'COMPLETED',
      searchGrounding: SEARCH,
    })
    expect(second).not.toHaveProperty('searchGrounding')
    const row = await db.generationJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(JSON.parse(row.externalRequestId!)).toEqual({
      outputType: 'IMAGE',
      creditCost: 1,
    })
  })

  it('并发轮询没抢到清除的那一次只拿到图', async () => {
    const generation = await seedGeneration(me.id)
    const job = await seedJob({
      status: 'COMPLETED',
      generationId: generation.id,
      externalRequestId: JSON.stringify({
        searchGrounding: { status: 'empty', sources: [] },
      }),
    })
    // 读完任务行、清来源之前，另一次轮询先把来源取走了。
    const updateMany = db.generationJob.updateMany.bind(db.generationJob)
    vi.spyOn(db.generationJob, 'updateMany').mockImplementationOnce((async (
      args: Parameters<typeof updateMany>[0],
    ) => {
      await db.generationJob.update({
        where: { id: job.id },
        data: { externalRequestId: '{}' },
      })
      return updateMany(args)
    }) as unknown as typeof updateMany)

    const result = await checkImageGenerationStatus(me.clerkId, job.id)

    expect(result).toMatchObject({ status: 'COMPLETED' })
    expect(result).not.toHaveProperty('searchGrounding')
  })

  it('失败了：照实交回原因', async () => {
    const job = await seedJob({
      status: 'FAILED',
      errorMessage:
        'Replicate image generation failed: Checkpoint not supported',
    })

    expect(await checkImageGenerationStatus(me.clerkId, job.id)).toEqual({
      jobId: job.id,
      status: 'FAILED',
      error: 'Replicate image generation failed: Checkpoint not supported',
      hasReferenceImage: false,
    })
  })

  it('还在跑：IN_PROGRESS；有中间图就带上最新那张', async () => {
    const plain = await seedJob()
    const previewing = await seedJob({
      externalRequestId: JSON.stringify({
        outputType: 'IMAGE',
        previewUrl: 'https://cdn.test/partial.png',
      }),
    })

    expect(await checkImageGenerationStatus(me.clerkId, plain.id)).toEqual({
      jobId: plain.id,
      status: 'IN_PROGRESS',
    })
    expect(await checkImageGenerationStatus(me.clerkId, previewing.id)).toEqual(
      {
        jobId: previewing.id,
        status: 'IN_PROGRESS',
        previewUrl: 'https://cdn.test/partial.png',
      },
    )
  })

  it('排队中：带上 Worker 报的执行阶段', async () => {
    const job = await seedJob({
      status: 'QUEUED',
      externalRequestId: JSON.stringify({
        outputType: 'IMAGE',
        executionStage: 'runnerQueued',
      }),
    })

    expect(await checkImageGenerationStatus(me.clerkId, job.id)).toEqual({
      jobId: job.id,
      status: 'IN_PROGRESS',
      executionStage: 'runnerQueued',
    })
  })

  it('跑了两小时没回音：就地判超时失败，任务行也落 FAILED', async () => {
    const job = await seedJob({
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await checkImageGenerationStatus(me.clerkId, job.id)

    expect(result).toMatchObject({
      jobId: job.id,
      status: 'FAILED',
      errorCode: 'callback_timeout',
    })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('FAILED')
  })

  it('别人的任务：JOB_NOT_FOUND', async () => {
    const other = await createTestUser()
    const generation = await seedGeneration(other.id)
    const job = await seedJob({
      userId: other.id,
      status: 'COMPLETED',
      generationId: generation.id,
    })

    await expect(
      checkImageGenerationStatus(me.clerkId, job.id),
    ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND', status: 404 })
  })
})

describe('waitForImageGenerationResult', () => {
  it('任务失败：把任务上记的原因原样抛出来', async () => {
    const job = await seedJob({
      status: 'FAILED',
      errorMessage: 'Provider rejected the reference image',
    })

    await expect(
      waitForImageGenerationResult(me.clerkId, job.id),
    ).rejects.toMatchObject({
      message: 'Provider rejected the reference image',
    })
  })

  it('出好了：交回作品', async () => {
    const generation = await seedGeneration(me.id)
    const job = await seedJob({
      status: 'COMPLETED',
      generationId: generation.id,
    })

    await expect(
      waitForImageGenerationResult(me.clerkId, job.id),
    ).resolves.toMatchObject({ id: generation.id })
  })
})
