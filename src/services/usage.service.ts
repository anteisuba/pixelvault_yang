import 'server-only'

import {
  API_USAGE,
  FREE_TIER,
  PLATFORM_GENERATION_GUARD,
  RUNAWAY_GENERATION_GUARD,
  RUNNER_MONTHLY_LIMIT,
} from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { Prisma } from '@/lib/generated/prisma/client'
import type {
  ApiUsageLedger,
  GenerationJob,
  GenerationJobStatus,
} from '@/lib/generated/prisma/client'
import type { RunnerUsageResult } from '@/types'

type UsageMutationClient = Pick<typeof db, 'generationJob' | 'apiUsageLedger'>
type GenerationJobCreateClient = Pick<
  typeof db,
  'generationJob' | '$executeRaw'
>

export interface CreateGenerationJobInput {
  userId: string
  adapterType: string
  provider: string
  modelId: string
  prompt?: string
  externalRequestId?: string
  /**
   * 这条生成是不是平台掏钱（平台自己的 API key / 免费额度），而非调用方自带 key
   * (BYOK)。只有 `true` 时才会过 `PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER`
   * 并发闸——BYOK 不占平台资源，不该被这道闸拦。
   *
   * 默认 `true`：调用方漏传时按「平台掏钱」处理，宁可多挡一道也不能把闸门当成
   * 「不限」的默认方向（2026-07-28 owner 定）。判定方式见各 service 里
   * `resolveGenerationRoute(...)` 返回的 `resolvedApiKeyId`——非空即 BYOK。
   */
  isPlatformFunded?: boolean
}

export interface UpdateGenerationJobInput {
  generationId?: string
  requestCount?: number
  errorMessage?: string
  errorCode?: string
  providerFailure?: Prisma.InputJsonValue
}

export interface CreateApiUsageEntryInput {
  userId: string
  generationId?: string
  generationJobId?: string
  adapterType: string
  provider: string
  modelId: string
  requestCount?: number
  inputImageCount?: number
  outputImageCount?: number
  width?: number
  height?: number
  durationMs?: number
  wasSuccessful: boolean
  errorMessage?: string
}

export interface UserUsageSummary {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  last30DaysRequests: number
  lastRequestAt: Date | null
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export class FreeTierExhaustedError extends Error {
  readonly code = 'FREE_LIMIT_EXCEEDED' as const

  constructor(limit: number) {
    super(
      `Free tier limit reached (${limit}/day). Bind your own API key to continue.`,
    )
    this.name = 'FreeTierExhaustedError'
  }
}

export class PlatformGenerationDisabledError extends ApiRequestError {
  readonly code = 'PLATFORM_GENERATION_DISABLED' as const

  constructor() {
    super(
      'PLATFORM_GENERATION_DISABLED',
      503,
      'errors.provider.failed',
      'Platform-funded generation is temporarily unavailable.',
    )
    this.name = 'PlatformGenerationDisabledError'
  }
}

export class PlatformDailyLimitExceededError extends ApiRequestError {
  readonly code = 'PLATFORM_DAILY_LIMIT_EXCEEDED' as const

  constructor(limit: number) {
    super(
      'PLATFORM_DAILY_LIMIT_EXCEEDED',
      429,
      'errors.rateLimit',
      `The platform daily generation budget has been reached (${limit}/day).`,
    )
    this.name = 'PlatformDailyLimitExceededError'
  }
}

export class ActiveGenerationLimitExceededError extends ApiRequestError {
  readonly code = 'ACTIVE_GENERATION_LIMIT_EXCEEDED' as const

  constructor(limit: number) {
    super(
      'ACTIVE_GENERATION_LIMIT_EXCEEDED',
      429,
      'errors.rateLimit',
      `You already have ${limit} active generation jobs. Wait for one to finish before starting another.`,
    )
    this.name = 'ActiveGenerationLimitExceededError'
  }
}

/**
 * 失控速率闸触发时抛出——不同于 `ActiveGenerationLimitExceededError`（「你同时
 * 开太多了」），这条是「有东西在反复自动发起生成，已暂停」，语气上不是在怪用户，
 * 是在提示大概率撞上了 bug（重试循环 / 卡住的自动化）。见 `errors.runawayGeneration`
 * 的三语文案，以及常量处 `RUNAWAY_GENERATION_GUARD` 的说明。
 */
export class RunawayGenerationLimitExceededError extends ApiRequestError {
  readonly code = 'RUNAWAY_GENERATION_LIMIT_EXCEEDED' as const

  constructor(limit: number, windowMs: number) {
    const windowLabel =
      windowMs % (60 * 60 * 1000) === 0
        ? `${windowMs / (60 * 60 * 1000)}h`
        : `${Math.round(windowMs / 1000)}s`
    super(
      'RUNAWAY_GENERATION_LIMIT_EXCEEDED',
      429,
      'errors.runawayGeneration',
      `This account fired more than ${limit} generation requests within ${windowLabel} — new requests are paused as a runaway-loop guard. This usually means a stuck retry loop or automation bug, not intentional heavy use.`,
    )
    this.name = 'RunawayGenerationLimitExceededError'
  }
}

export function isPlatformGenerationEnabled(): boolean {
  const configured = process.env.PLATFORM_GENERATION_ENABLED
  if (configured === 'true') return true
  if (configured === 'false' || configured === '') return false
  return process.env.NODE_ENV !== 'production'
}

export function assertPlatformGenerationEnabled(): void {
  if (!isPlatformGenerationEnabled()) {
    throw new PlatformGenerationDisabledError()
  }
}

/**
 * Atomically claim one free-tier slot for `(userId, today)` against a daily
 * cap, returning normally on success or throwing `FreeTierExhaustedError`
 * when the cap is hit.
 *
 * Previously used a Serializable transaction + count+create — that path
 * relied on SSI retries (P2034) and burned a Postgres-internal advisory
 * lock per Vercel connection. Two reasons it was the wrong tool:
 *
 *   1. Serializable is heavy in Neon; the SSI retry budget is small and
 *      P2034 surfaces as `FreeTierExhaustedError` regardless of the real
 *      reason, so genuine concurrent reservations were silently dropped.
 *   2. The cap is per-(user, day), so we don't need global serialization;
 *      a per-key advisory lock contains contention to the one user racing
 *      against themselves (the typical double-click case).
 *
 * The new path takes a `pg_advisory_xact_lock` keyed by user+date in the
 * default ReadCommitted isolation level. The lock releases automatically
 * on commit/rollback; nothing else in the codebase acquires advisory
 * locks, so the keyspace is private.
 */
export async function atomicReserveFreeTierSlot(userId: string): Promise<void> {
  if (!FREE_TIER.ENABLED) return
  assertPlatformGenerationEnabled()

  const date = todayUTC()
  const lockKey = `platform-free-tier-budget:${date}`

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`

    const platformCount = await tx.freeTierSlot.count({
      where: { date },
    })

    if (platformCount >= PLATFORM_GENERATION_GUARD.DAILY_LIMIT) {
      throw new PlatformDailyLimitExceededError(
        PLATFORM_GENERATION_GUARD.DAILY_LIMIT,
      )
    }

    const userCount = await tx.freeTierSlot.count({
      where: { userId, date },
    })

    if (userCount >= FREE_TIER.DAILY_LIMIT) {
      throw new FreeTierExhaustedError(FREE_TIER.DAILY_LIMIT)
    }

    await tx.freeTierSlot.create({
      data: { userId, date },
    })
  })
}

export async function getFreeTierSlotsUsedToday(
  userId: string,
): Promise<number> {
  return db.freeTierSlot.count({
    where: {
      userId,
      date: todayUTC(),
    },
  })
}

// ─── Comfy Runner monthly budget guardrail ───────────────────────
//
// RunPod's panel can cap per-job concurrency/cost but not "N generations per
// month" — that lives here, mirroring the FREE_TIER daily cap above. Unlike
// FREE_TIER (per-user daily), this is a single global monthly counter: the
// budget it protects (a $10/month prepaid RunPod balance) is shared account
// spend, not a per-user fairness allowance. Counts `GenerationJob` rows
// (created at submit time, before the async worker even runs) rather than
// `ApiUsageLedger` (only written on success) so failed/in-flight runner
// dispatches — which still cost RunPod compute — count against the budget.

export class RunnerMonthlyLimitExceededError extends Error {
  readonly code = 'RUNNER_MONTHLY_LIMIT_EXCEEDED' as const

  constructor(limit: number) {
    super(
      `Runner monthly generation limit reached (${limit}/month). Try again next month, or use a hosted model instead.`,
    )
    this.name = 'RunnerMonthlyLimitExceededError'
  }
}

function startOfMonthUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** Number of RUNNER-adapter generation jobs created since the start of the current UTC month. */
export async function getRunnerMonthlyGenerationCount(): Promise<number> {
  return db.generationJob.count({
    where: {
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      createdAt: { gte: startOfMonthUTC() },
    },
  })
}

/**
 * Throws `RunnerMonthlyLimitExceededError` if the monthly RUNNER budget cap
 * has been reached. Call before dispatching a RUNNER generation.
 */
export async function assertRunnerMonthlyLimitNotExceeded(): Promise<void> {
  if (!RUNNER_MONTHLY_LIMIT.ENABLED) return
  assertPlatformGenerationEnabled()

  const count = await getRunnerMonthlyGenerationCount()
  if (count >= RUNNER_MONTHLY_LIMIT.LIMIT) {
    throw new RunnerMonthlyLimitExceededError(RUNNER_MONTHLY_LIMIT.LIMIT)
  }
}

/**
 * 全站 runner 月度额度快照（全局共享，非 per-user），给 LoRA 工作台「本月剩余
 * N/300」主动提示用。ENABLED=false 时 used/limit=0、remaining=0，前端据此不显示。
 */
export async function getRunnerUsage(): Promise<RunnerUsageResult> {
  if (!RUNNER_MONTHLY_LIMIT.ENABLED) {
    return { enabled: false, used: 0, limit: 0, remaining: 0 }
  }
  const used = await getRunnerMonthlyGenerationCount()
  const limit = RUNNER_MONTHLY_LIMIT.LIMIT
  return { enabled: true, used, limit, remaining: Math.max(0, limit - used) }
}

export async function createGenerationJob(
  input: CreateGenerationJobInput,
  client?: GenerationJobCreateClient,
): Promise<GenerationJob> {
  if (client) {
    return createGenerationJobWithinLimits(input, client)
  }

  return db.$transaction((tx) => createGenerationJobWithinLimits(input, tx))
}

/**
 * 失控速率闸：拦「反复自动发起生成」的死循环/bug，对所有生成路径生效（不分平台
 * 掏钱还是 BYOK、不分 adapter），按账户（userId）计数。
 *
 * **两档：小时档拦「快速失控」，日档拦「通宵慢速长跑」。** 不设分钟档——那一级已经
 * 由 `RATE_LIMIT_CONFIGS` 的 per-route 限流管了。为什么是两道闸、为什么按账户不按
 * 全站、两个数字怎么推出来的，见 RUNAWAY_GENERATION_GUARD 常量处的完整说明。
 *
 * ⚠ 日档不是小时档的冗余：小时档管不住「每小时单看都合规、但连跑一整夜」的循环，
 * 而那正是 BYOK 解除并发限制之后最贵的失控形态。
 */
async function assertRunawayGenerationRateNotExceeded(
  userId: string,
  client: GenerationJobCreateClient,
): Promise<void> {
  const lockKey = `runaway-generation-rate:${userId}`
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`

  const now = Date.now()

  // 小时档在前、日档在后：快速循环撞小时档，通宵慢速长跑撞日档，谁先命中都对。
  // 顺序不影响正确性（两个都会查），只是让最常见的快速失控少查一次。
  const hourCount = await client.generationJob.count({
    where: {
      userId,
      createdAt: {
        gte: new Date(now - RUNAWAY_GENERATION_GUARD.HOUR_WINDOW_MS),
      },
    },
  })

  if (hourCount >= RUNAWAY_GENERATION_GUARD.HOUR_LIMIT) {
    throw new RunawayGenerationLimitExceededError(
      RUNAWAY_GENERATION_GUARD.HOUR_LIMIT,
      RUNAWAY_GENERATION_GUARD.HOUR_WINDOW_MS,
    )
  }

  const dayCount = await client.generationJob.count({
    where: {
      userId,
      createdAt: {
        gte: new Date(now - RUNAWAY_GENERATION_GUARD.DAY_WINDOW_MS),
      },
    },
  })

  if (dayCount >= RUNAWAY_GENERATION_GUARD.DAY_LIMIT) {
    throw new RunawayGenerationLimitExceededError(
      RUNAWAY_GENERATION_GUARD.DAY_LIMIT,
      RUNAWAY_GENERATION_GUARD.DAY_WINDOW_MS,
    )
  }
}

async function createGenerationJobWithinLimits(
  input: CreateGenerationJobInput,
  client: GenerationJobCreateClient,
): Promise<GenerationJob> {
  // 失控优先拦：在成本闸（RUNNER 月度额度 / 并发上限）之前跑，不分平台掏钱还是
  // BYOK、不分 adapter，全路径都过。见 RUNAWAY_GENERATION_GUARD 常量处的说明。
  await assertRunawayGenerationRateNotExceeded(input.userId, client)

  if (
    RUNNER_MONTHLY_LIMIT.ENABLED &&
    input.adapterType === AI_ADAPTER_TYPES.RUNNER
  ) {
    assertPlatformGenerationEnabled()
    const monthStart = startOfMonthUTC()
    const monthKey = monthStart.toISOString().slice(0, 7)
    const lockKey = `runner-monthly-budget:${monthKey}`

    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`

    const count = await client.generationJob.count({
      where: {
        adapterType: AI_ADAPTER_TYPES.RUNNER,
        createdAt: { gte: monthStart },
      },
    })

    if (count >= RUNNER_MONTHLY_LIMIT.LIMIT) {
      throw new RunnerMonthlyLimitExceededError(RUNNER_MONTHLY_LIMIT.LIMIT)
    }
  }

  // 并发闸只管平台掏钱的那条路（platform key / 免费额度）。调用方自带 key 时
  // 平台不出钱，这道闸不该拦——见 CreateGenerationJobInput.isPlatformFunded。
  // 漏传按 true 处理（默认值定义在该字段上），即「宁可多挡一道也别放行」。
  if (input.isPlatformFunded ?? true) {
    const activeLockKey = `active-generation-jobs:${input.userId}`
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${activeLockKey}, 0))`

    // 只数「还可能真在跑」的 job：超过 ACTIVE_JOB_MAX_AGE_MS 仍未落终态的，几乎
    // 一定是回调丢了的僵尸，不能让它永久扣住并发位（见常量处的事故记录）。
    const activeSince = new Date(
      Date.now() - PLATFORM_GENERATION_GUARD.ACTIVE_JOB_MAX_AGE_MS,
    )
    const activeCount = await client.generationJob.count({
      where: {
        userId: input.userId,
        status: { in: [...PLATFORM_GENERATION_GUARD.ACTIVE_JOB_STATUSES] },
        createdAt: { gte: activeSince },
      },
    })

    if (activeCount >= PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER) {
      throw new ActiveGenerationLimitExceededError(
        PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER,
      )
    }
  }

  return createGenerationJobRecord(input, client)
}

function createGenerationJobRecord(
  input: CreateGenerationJobInput,
  client: Pick<typeof db, 'generationJob'>,
): Promise<GenerationJob> {
  return client.generationJob.create({
    data: {
      userId: input.userId,
      adapterType: input.adapterType,
      provider: input.provider,
      modelId: input.modelId,
      status: 'RUNNING',
      prompt: input.prompt,
      externalRequestId: input.externalRequestId,
      startedAt: new Date(),
    },
  })
}

export async function completeGenerationJob(
  id: string,
  input: UpdateGenerationJobInput,
  client: UsageMutationClient = db,
): Promise<GenerationJob> {
  return client.generationJob.update({
    where: { id },
    data: {
      generationId: input.generationId,
      requestCount: input.requestCount,
      status: 'COMPLETED',
      completedAt: new Date(),
      errorMessage: null,
      errorCode: null,
      providerFailure: Prisma.DbNull,
    },
  })
}

export async function failGenerationJob(
  id: string,
  input: UpdateGenerationJobInput,
  client: UsageMutationClient = db,
): Promise<GenerationJob> {
  return client.generationJob.update({
    where: { id },
    data: {
      requestCount: input.requestCount,
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: input.errorMessage,
      errorCode: input.errorCode,
      providerFailure: input.providerFailure,
    },
  })
}

export interface FailActiveGenerationJobResult {
  transitioned: boolean
  status: GenerationJobStatus | null
}

/**
 * Mark only an active job as failed. Callback and reconciliation paths must use
 * this CAS transition so a late failure cannot overwrite a terminal success.
 * When the CAS loses, return the persisted status for an honest callback ack.
 */
export async function failActiveGenerationJob(
  id: string,
  input: UpdateGenerationJobInput,
  client: UsageMutationClient = db,
): Promise<FailActiveGenerationJobResult> {
  const result = await client.generationJob.updateMany({
    where: {
      id,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    data: {
      requestCount: input.requestCount,
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: input.errorMessage,
      errorCode: input.errorCode,
      providerFailure: input.providerFailure,
    },
  })

  if (result.count === 1) {
    return { transitioned: true, status: 'FAILED' }
  }

  const existing = await client.generationJob.findUnique({
    where: { id },
    select: { status: true },
  })

  return { transitioned: false, status: existing?.status ?? null }
}

export async function createApiUsageEntry(
  input: CreateApiUsageEntryInput,
  client: UsageMutationClient = db,
): Promise<ApiUsageLedger> {
  return client.apiUsageLedger.create({
    data: {
      userId: input.userId,
      generationId: input.generationId,
      generationJobId: input.generationJobId,
      adapterType: input.adapterType,
      provider: input.provider,
      modelId: input.modelId,
      requestCount:
        input.requestCount ?? API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      inputImageCount: input.inputImageCount ?? 0,
      outputImageCount: input.outputImageCount ?? 1,
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      wasSuccessful: input.wasSuccessful,
      errorMessage: input.errorMessage,
    },
  })
}

export async function attachUsageEntryToGeneration(
  usageEntryId: string,
  generationId: string,
): Promise<ApiUsageLedger> {
  return db.apiUsageLedger.update({
    where: { id: usageEntryId },
    data: {
      generationId,
    },
  })
}

export async function getUserUsageSummary(
  userId: string,
): Promise<UserUsageSummary> {
  const lookbackStart = new Date()
  lookbackStart.setDate(
    lookbackStart.getDate() - API_USAGE.SUMMARY_LOOKBACK_DAYS,
  )

  type Row = {
    total: bigint | null
    successful: bigint | null
    failed: bigint | null
    last30days: bigint | null
    last_request_at: Date | null
  }

  const rows = await db.$queryRaw<Row[]>`
    SELECT
      SUM("requestCount")                                                      AS total,
      SUM(CASE WHEN "wasSuccessful" THEN "requestCount" ELSE 0 END)           AS successful,
      SUM(CASE WHEN NOT "wasSuccessful" THEN "requestCount" ELSE 0 END)       AS failed,
      SUM(CASE WHEN "createdAt" >= ${lookbackStart} THEN "requestCount" ELSE 0 END) AS last30days,
      MAX("createdAt")                                                         AS last_request_at
    FROM "ApiUsageLedger"
    WHERE "userId" = ${userId}
  `

  const row = rows[0]
  return {
    totalRequests: Number(row?.total ?? 0),
    successfulRequests: Number(row?.successful ?? 0),
    failedRequests: Number(row?.failed ?? 0),
    last30DaysRequests: Number(row?.last30days ?? 0),
    lastRequestAt: row?.last_request_at ?? null,
  }
}
