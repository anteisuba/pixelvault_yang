/**
 * L2a 真库：任务与用量账（usage.service）。几道闸（失控速率、Runner 月度额度、平台并发）的计数、
 * advisory lock、事务全走真库；管理员按真 env 认（测试里设一个假 clerkId）。
 * 核库里的任务 / 用量行与抛出的错。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// 管理员名单在模块加载时读 env：要在 import 之前设好
const ADMIN_CLERK_ID = vi.hoisted(() => {
  process.env.ADMIN_USER_IDS = 'clerk_admin_for_test'
  return 'clerk_admin_for_test'
})

import {
  PLATFORM_GENERATION_GUARD,
  RUNAWAY_GENERATION_GUARD,
  RUNNER_MONTHLY_LIMIT,
} from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  ActiveGenerationLimitExceededError,
  assertRunnerMonthlyLimitNotExceeded,
  attachUsageEntryToGeneration,
  completeGenerationJob,
  createApiUsageEntry,
  createGenerationJob,
  failActiveGenerationJob,
  failGenerationJob,
  getRunnerUsage,
  RunawayGenerationLimitExceededError,
  RunnerMonthlyLimitExceededError,
} from '@/services/usage.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  vi.unstubAllEnvs()
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

/** 一次落 n 条任务（计数用）。 */
function seedJobs(
  n: number,
  extra: Partial<{
    userId: string
    adapterType: string
    status: 'RUNNING' | 'COMPLETED'
    createdAt: Date
  }> = {},
) {
  const adapterType = extra.adapterType ?? AI_ADAPTER_TYPES.FAL
  return db.generationJob.createMany({
    data: Array.from({ length: n }, () => ({
      userId: me.id,
      provider: adapterType,
      modelId: 'm',
      status: 'COMPLETED' as const,
      ...extra,
      adapterType,
    })),
  })
}

const job = (
  userId: string,
  extra: Partial<Parameters<typeof createGenerationJob>[0]> = {},
) =>
  createGenerationJob({
    userId,
    adapterType: AI_ADAPTER_TYPES.FAL,
    provider: 'fal.ai',
    modelId: 'fal-ai/flux-2-pro',
    ...extra,
  })

const runnerJob = (userId: string) =>
  job(userId, {
    adapterType: AI_ADAPTER_TYPES.RUNNER,
    provider: 'runner',
    modelId: 'runner-sdxl',
    isPlatformFunded: false,
  })

describe('createGenerationJob（真库）', () => {
  it('建一条 RUNNING、带开始时间的任务；别人的对话不记', async () => {
    const theirs = await db.assistantConversation.create({
      data: { userId: other.id, surface: 'IMAGE_STUDIO', messages: [] },
    })
    const created = await job(me.id, {
      prompt: 'a cat',
      conversationId: theirs.id,
    })
    expect(
      await db.generationJob.findUniqueOrThrow({ where: { id: created.id } }),
    ).toMatchObject({
      userId: me.id,
      status: 'RUNNING',
      prompt: 'a cat',
      conversationId: null,
    })
    expect(created.startedAt).not.toBeNull()
  })

  describe('平台并发闸', () => {
    it(`平台掏钱：同时在跑 ${PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER} 条就不让建第 ${PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER + 1} 条`, async () => {
      await seedJobs(PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER, {
        status: 'RUNNING',
      })
      await expect(job(me.id)).rejects.toBeInstanceOf(
        ActiveGenerationLimitExceededError,
      )
      expect(await db.generationJob.count()).toBe(
        PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER,
      )
    })

    it('自带 key（BYOK）不过这道闸；太老的在跑任务（回调丢了）不占位', async () => {
      await seedJobs(PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER, {
        status: 'RUNNING',
      })
      await expect(
        job(me.id, { isPlatformFunded: false }),
      ).resolves.toBeTruthy()

      await seedJobs(PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER, {
        userId: other.id,
        status: 'RUNNING',
        createdAt: new Date(
          Date.now() - PLATFORM_GENERATION_GUARD.ACTIVE_JOB_MAX_AGE_MS - 60_000,
        ),
      })
      await expect(job(other.id)).resolves.toBeTruthy()
    })
  })

  describe('失控速率闸', () => {
    it('这个账号一小时内到了上限：拒（BYOK 也拒）', async () => {
      await seedJobs(RUNAWAY_GENERATION_GUARD.HOUR_LIMIT)
      await expect(
        job(me.id, { isPlatformFunded: false }),
      ).rejects.toBeInstanceOf(RunawayGenerationLimitExceededError)
    })

    it('一小时内没到、一天内到了：也拒', async () => {
      await seedJobs(RUNAWAY_GENERATION_GUARD.DAY_LIMIT, {
        createdAt: new Date(
          Date.now() - 2 * RUNAWAY_GENERATION_GUARD.HOUR_WINDOW_MS,
        ),
      })
      await expect(job(me.id)).rejects.toThrow(
        String(RUNAWAY_GENERATION_GUARD.DAY_LIMIT),
      )
    })

    it('按账号数：别人刷满了不影响我', async () => {
      await seedJobs(RUNAWAY_GENERATION_GUARD.HOUR_LIMIT, { userId: other.id })
      await expect(job(me.id)).resolves.toBeTruthy()
    })

    it('先于 Runner 月度额度拦', async () => {
      await seedJobs(RUNAWAY_GENERATION_GUARD.HOUR_LIMIT, {
        adapterType: AI_ADAPTER_TYPES.RUNNER,
      })
      await expect(runnerJob(me.id)).rejects.toBeInstanceOf(
        RunawayGenerationLimitExceededError,
      )
    })
  })

  describe('Runner 月度额度', () => {
    it('我本月用满了：不建', async () => {
      await seedJobs(RUNNER_MONTHLY_LIMIT.PER_USER_LIMIT, {
        adapterType: AI_ADAPTER_TYPES.RUNNER,
      })
      await expect(runnerJob(me.id)).rejects.toBeInstanceOf(
        RunnerMonthlyLimitExceededError,
      )
    })

    it('全站本月用满了：不建；管理员两道都不拦', async () => {
      await seedJobs(RUNNER_MONTHLY_LIMIT.SITE_LIMIT, {
        userId: other.id,
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        createdAt: new Date(
          Date.now() - 2 * RUNAWAY_GENERATION_GUARD.DAY_WINDOW_MS,
        ),
      })
      await expect(runnerJob(me.id)).rejects.toBeInstanceOf(
        RunnerMonthlyLimitExceededError,
      )

      const admin = await createTestUser({ clerkId: ADMIN_CLERK_ID })
      await expect(runnerJob(admin.id)).resolves.toBeTruthy()
    })
  })
})

describe('任务收尾（真库）', () => {
  it('完成：记上作品、清掉错误；失败：留下错误', async () => {
    const created = await job(me.id)
    const gen = await seedGeneration(me.id)
    await failGenerationJob(created.id, {
      errorMessage: 'provider down',
      errorCode: 'X',
    })
    expect(
      await db.generationJob.findUniqueOrThrow({ where: { id: created.id } }),
    ).toMatchObject({ status: 'FAILED', errorMessage: 'provider down' })

    await completeGenerationJob(created.id, { generationId: gen.id })
    const done = await db.generationJob.findUniqueOrThrow({
      where: { id: created.id },
    })
    expect(done).toMatchObject({
      status: 'COMPLETED',
      generationId: gen.id,
      errorMessage: null,
      errorCode: null,
    })
    expect(done.completedAt).not.toBeNull()
  })

  it('只把在跑的判失败：已完成的不盖，回它真实的状态', async () => {
    const running = await job(me.id)
    expect(
      await failActiveGenerationJob(running.id, { errorMessage: 'late' }),
    ).toEqual({ transitioned: true, status: 'FAILED' })

    const finished = await job(me.id)
    await completeGenerationJob(finished.id, {})
    expect(
      await failActiveGenerationJob(finished.id, { errorMessage: 'late' }),
    ).toEqual({ transitioned: false, status: 'COMPLETED' })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: finished.id } }))
        .status,
    ).toBe('COMPLETED')
    expect(await failActiveGenerationJob('missing', {})).toEqual({
      transitioned: false,
      status: null,
    })
  })
})

describe('用量账（真库）', () => {
  it('默认 1 次请求、出 1 张、进 0 张；给了就按给的；能挂到作品上', async () => {
    const base = {
      userId: me.id,
      adapterType: 'fal',
      provider: 'fal.ai',
      modelId: 'fal-ai/flux-2-pro',
      wasSuccessful: true,
    }
    const entry = await createApiUsageEntry(base)
    expect(entry).toMatchObject({
      requestCount: 1,
      outputImageCount: 1,
      inputImageCount: 0,
      wasSuccessful: true,
    })
    expect(
      (await createApiUsageEntry({ ...base, requestCount: 3 })).requestCount,
    ).toBe(3)

    const gen = await seedGeneration(me.id)
    await attachUsageEntryToGeneration(entry.id, gen.id)
    expect(
      (await db.apiUsageLedger.findUniqueOrThrow({ where: { id: entry.id } }))
        .generationId,
    ).toBe(gen.id)
  })
})

describe('Runner 额度快照（真库）', () => {
  it('我的余量 = 个人上限 - 本月已用；上个月的不算', async () => {
    await seedJobs(10, { adapterType: AI_ADAPTER_TYPES.RUNNER })
    await seedJobs(5, {
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      createdAt: new Date(Date.UTC(2020, 0, 1)),
    })
    expect(await getRunnerUsage(me.id)).toEqual({
      enabled: true,
      used: 10,
      limit: RUNNER_MONTHLY_LIMIT.PER_USER_LIMIT,
      remaining: RUNNER_MONTHLY_LIMIT.PER_USER_LIMIT - 10,
      exempt: false,
      platformEnabled: true,
    })
    await expect(
      assertRunnerMonthlyLimitNotExceeded(me.id),
    ).resolves.toBeUndefined()
  })

  it('全站先见底：余量按全站剩的算；超了不出负数', async () => {
    await seedJobs(RUNNER_MONTHLY_LIMIT.SITE_LIMIT - 3, {
      userId: other.id,
      adapterType: AI_ADAPTER_TYPES.RUNNER,
    })
    expect((await getRunnerUsage(me.id)).remaining).toBe(3)
    await seedJobs(10, {
      userId: other.id,
      adapterType: AI_ADAPTER_TYPES.RUNNER,
    })
    expect((await getRunnerUsage(me.id)).remaining).toBe(0)
    await expect(
      assertRunnerMonthlyLimitNotExceeded(me.id),
    ).rejects.toBeInstanceOf(RunnerMonthlyLimitExceededError)
  })

  it('管理员：报全站预算、标 exempt', async () => {
    const admin = await createTestUser({ clerkId: ADMIN_CLERK_ID })
    await seedJobs(2, {
      userId: admin.id,
      adapterType: AI_ADAPTER_TYPES.RUNNER,
    })
    expect(await getRunnerUsage(admin.id)).toMatchObject({
      used: 2,
      limit: RUNNER_MONTHLY_LIMIT.SITE_LIMIT,
      remaining: RUNNER_MONTHLY_LIMIT.SITE_LIMIT - 2,
      exempt: true,
    })
  })

  it('平台总闸关着：快照照实报 platformEnabled=false', async () => {
    vi.stubEnv('PLATFORM_GENERATION_ENABLED', 'false')
    expect((await getRunnerUsage(me.id)).platformEnabled).toBe(false)
  })
})
