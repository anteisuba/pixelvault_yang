/**
 * L2a 真库 + 真提交链路：多视角补图（/api/generate-multiview → 三个角度各派一单出图）与状态汇总。
 * 只假边界：Clerk 登录、限流、执行 Worker（fetch）、R2 的真 I/O。核任务行、派给 Worker 的东西与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  GENERATED_VIEW_ANGLES,
  MULTI_VIEW_NEGATIVE,
  MULTI_VIEW_PROMPTS,
} from '@/constants/three-d-ready-prompt'
import { POST } from '@/app/api/generate-multiview/route'
import { db } from '@/lib/db'
import {
  checkMultiViewGenerationStatus,
  generateMultiView,
} from '@/services/multiview-generate.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  FAKE_WORKER_BASE_URL,
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { fakeBucket } from '@/test/int/fake-r2'
import { seedGeneration } from '@/test/int/seed-generation'
import type { MultiViewGenerateResponseData } from '@/types'

type Angle = (typeof GENERATED_VIEW_ANGLES)[number]

const FRONT = 'https://cdn.test/front.png'

let me: Awaited<ReturnType<typeof createTestUser>>
let worker: FakeExecutionWorker

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  worker = installFakeExecutionWorker()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const metadataOf = (job: { externalRequestId: string | null }) =>
  JSON.parse(job.externalRequestId ?? '{}') as Record<string, unknown>

describe('POST /api/generate-multiview', () => {
  it('没登录 401、限流 429、图地址不对 400：⛔ 建任务', async () => {
    mockUnauthenticated()
    expect(
      (await POST(createPOST('/api/generate-multiview', { imageUrl: FRONT })))
        .status,
    ).toBe(401)

    mockAuthenticated(me.clerkId)
    mockRateLimitExceeded()
    expect(
      (await POST(createPOST('/api/generate-multiview', { imageUrl: FRONT })))
        .status,
    ).toBe(429)

    mockRateLimitAllowed()
    expect((await POST(createPOST('/api/generate-multiview', {}))).status).toBe(
      400,
    )
    expect(
      (
        await POST(
          createPOST('/api/generate-multiview', { imageUrl: 'not a url' }),
        )
      ).status,
    ).toBe(400)
    expect(await db.generationJob.count()).toBe(0)
  })

  it('每个角度派一单：同一批号、正面图当参考、各自角度的提示词', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)

    const res = await POST(
      createPOST('/api/generate-multiview', {
        imageUrl: FRONT,
        sourceGenerationId: 'src_1',
      }),
    )
    const json = await parseJSON<{
      success: boolean
      data: MultiViewGenerateResponseData
    }>(res)

    expect(res.status).toBe(200)
    expect(json.data.jobs.map((job) => job.view)).toEqual(GENERATED_VIEW_ANGLES)

    const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
    expect(jobs).toHaveLength(GENERATED_VIEW_ANGLES.length)
    for (const job of jobs) {
      const metadata = metadataOf(job)
      expect(metadata).toMatchObject({
        outputType: 'IMAGE',
        multiViewBatchId: json.data.batchId,
        sourceGenerationId: 'src_1',
      })
      expect(job.prompt).toBe(
        MULTI_VIEW_PROMPTS[metadata.multiViewAngle as Angle],
      )
      expect(job.modelId).toBe(AI_MODELS.OPENAI_GPT_IMAGE_2)
    }
    expect(worker.requests).toHaveLength(GENERATED_VIEW_ANGLES.length)
    for (const request of worker.requests) {
      expect(JSON.stringify(request.json)).toContain(FRONT)
      expect(JSON.stringify(request.json)).toContain(MULTI_VIEW_NEGATIVE)
    }
  })
})

describe('generateMultiView', () => {
  it('照用户选的型号 / key / 项目派单', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const project = await db.project.create({
      data: { userId: me.id, name: 'p' },
    })

    await generateMultiView(me.clerkId, {
      imageUrl: FRONT,
      modelId: AI_MODELS.GEMINI_NANO_BANANA_21,
      apiKeyId: key.id,
      projectId: project.id,
    })

    const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
    expect(jobs).toHaveLength(3)
    expect(
      jobs.every((job) => job.modelId === AI_MODELS.GEMINI_NANO_BANANA_21),
    ).toBe(true)
    expect(worker.requests.map((r) => r.json.apiKeyId)).toEqual([
      key.id,
      key.id,
      key.id,
    ])
  })

  it('一个角度没派出去：交回其余两个', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    // 左视角那一单 Worker 明确拒收，其余照收。
    const accept = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (
        String(input).startsWith(FAKE_WORKER_BASE_URL) &&
        String(init?.body ?? '').includes(
          JSON.stringify(MULTI_VIEW_PROMPTS.left).slice(1, -1),
        )
      ) {
        return new Response('rejected', { status: 400 })
      }
      return accept(input, init)
    })

    const result = await generateMultiView(me.clerkId, { imageUrl: FRONT })

    expect(result.jobs.map((job) => job.view)).toEqual(['back', 'right'])
  })

  it('三个角度都没派出去：502', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    worker.reject(400)

    await expect(
      generateMultiView(me.clerkId, { imageUrl: FRONT }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR', status: 502 })
  })

  it('不支持多视角的型号：400，⛔ 派单', async () => {
    await expect(
      generateMultiView(me.clerkId, {
        imageUrl: FRONT,
        modelId: AI_MODELS.ILLUSTRIOUS_XL,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL', status: 400 })
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })
})

describe('checkMultiViewGenerationStatus', () => {
  const BATCH = 'batch-1'

  async function seedAngleJob(
    angle: Angle,
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'RUNNING',
    options: { userId?: string; batchId?: string } = {},
  ) {
    const userId = options.userId ?? me.id
    const generation =
      status === 'COMPLETED'
        ? await seedGeneration(userId, {
            prompt: MULTI_VIEW_PROMPTS[angle],
            width: 1024,
            height: 1024,
          })
        : null
    return db.generationJob.create({
      data: {
        userId,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        provider: 'openai',
        modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
        prompt: MULTI_VIEW_PROMPTS[angle],
        status,
        startedAt: new Date(),
        generationId: generation?.id ?? null,
        errorMessage: status === 'FAILED' ? 'provider failed' : null,
        externalRequestId: JSON.stringify({
          outputType: 'IMAGE',
          multiViewBatchId: options.batchId ?? BATCH,
          multiViewAngle: angle,
        }),
      },
      include: { generation: true },
    })
  }

  it('三个角度都出好了：按角度顺序交回三张图', async () => {
    const jobs = []
    for (const angle of GENERATED_VIEW_ANGLES) {
      jobs.push(await seedAngleJob(angle, 'COMPLETED'))
    }

    const result = await checkMultiViewGenerationStatus(me.clerkId, {
      batchId: BATCH,
      jobIds: jobs.map((job) => job.id),
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.views.map((view) => view.view)).toEqual(GENERATED_VIEW_ANGLES)
    expect(result.views.map((view) => view.url)).toEqual(
      jobs.map((job) => job.generation!.url),
    )
  })

  it('有一个出好、一个失败：整批算完成，失败那个标 FAILED', async () => {
    const back = await seedAngleJob('back', 'COMPLETED')
    const left = await seedAngleJob('left', 'FAILED')

    const result = await checkMultiViewGenerationStatus(me.clerkId, {
      batchId: BATCH,
      jobIds: [back.id, left.id],
    })

    expect(result.status).toBe('COMPLETED')
    expect(result.views.map((view) => view.view)).toEqual(['back'])
    expect(result.jobs.find((job) => job.view === 'left')).toMatchObject({
      status: 'FAILED',
      error: 'provider failed',
    })
  })

  it('还有在跑的：整批 IN_PROGRESS', async () => {
    const back = await seedAngleJob('back', 'COMPLETED')
    const left = await seedAngleJob('left', 'RUNNING')

    const result = await checkMultiViewGenerationStatus(me.clerkId, {
      batchId: BATCH,
      jobIds: [back.id, left.id],
    })

    expect(result.status).toBe('IN_PROGRESS')
  })

  it('全失败：FAILED、没有图', async () => {
    const back = await seedAngleJob('back', 'FAILED')

    const result = await checkMultiViewGenerationStatus(me.clerkId, {
      batchId: BATCH,
      jobIds: [back.id],
    })

    expect(result).toMatchObject({ status: 'FAILED', views: [] })
  })

  it('子任务被取消：算终态 FAILED（⛔ 一直卡在 IN_PROGRESS）', async () => {
    const back = await seedAngleJob('back', 'COMPLETED')
    const left = await seedAngleJob('left', 'CANCELLED')

    const onlyCancelled = await checkMultiViewGenerationStatus(me.clerkId, {
      batchId: BATCH,
      jobIds: [left.id],
    })
    expect(onlyCancelled).toMatchObject({
      status: 'FAILED',
      views: [],
      jobs: [{ status: 'FAILED' }],
    })

    const mixed = await checkMultiViewGenerationStatus(me.clerkId, {
      batchId: BATCH,
      jobIds: [back.id, left.id],
    })
    expect(mixed.status).toBe('COMPLETED')
    expect(mixed.views.map((view) => view.view)).toEqual(['back'])
  })

  it('别人的任务、不在这一批的任务、不存在的任务：404', async () => {
    const other = await createTestUser()
    const theirs = await seedAngleJob('back', 'COMPLETED', { userId: other.id })
    const otherBatch = await seedAngleJob('left', 'COMPLETED', {
      batchId: 'batch-2',
    })

    for (const jobIds of [[theirs.id], [otherBatch.id], ['missing']]) {
      await expect(
        checkMultiViewGenerationStatus(me.clerkId, { batchId: BATCH, jobIds }),
      ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND', status: 404 })
    }
  })
})
