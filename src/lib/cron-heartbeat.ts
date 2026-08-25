import 'server-only'

import { Redis } from '@upstash/redis'
import { z } from 'zod'

import {
  CRON_HEARTBEAT,
  CRON_JOB_NAMES,
  type CronJobName,
} from '@/constants/cron'
import { logger } from '@/lib/logger'

/**
 * Cron 运行结果的心跳落点。
 *
 * 存在的理由：**Hobby 的 runtime log 只留 1 小时**（
 * <https://vercel.com/docs/logs/runtime> 的 Retention 表）。一条 04:00 跑的
 * cron，到 05:00 它的日志就没了——「昨天那条到底跑没跑、跑成什么样」在今天
 * 是**结构上无法回答**的。而 Vercel 对失败的 cron **不重试**，投递本身也只是
 * best effort（见 manage-cron-jobs 的 "Cron job error handling" 与 "Cron job
 * delivery and idempotency"）。所以要么把结果写进一个活得比日志长的地方，
 * 要么永远不知道。
 *
 * 落点选 Upstash 而不是新建一张表：Upstash 在生产**已经是硬依赖**（回调防重放
 * 的 `execution-replay-guard` 没它直接 fail-closed），加一张 Prisma 表则要在
 * 开发机上跑迁移——而本仓的开发机连的就是生产库。零迁移、零新依赖。
 *
 * 附带的好处：读心跳这条路走 Upstash，于是 **Upstash 挂了 = 健康端点 503 =
 * 开 issue**。回调链路的 fail-closed 单点因此第一次有了信号。
 */

/**
 * Redis 客户端。
 *
 * ⚠ 这里是第三处构造 Upstash 客户端（另两处：`rate-limit.ts` 模块级、
 * `execution-replay-guard.ts` 懒加载）。没有抽公共模块，是因为抽一层要动
 * 那条安全关键的防重放路径，而省下的只有十行——不划算。
 */
let redisClient: Redis | null = null
let redisIdentity = ''

function getConfiguredRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const identity = `${url}\u0000${token}`
  if (!redisClient || redisIdentity !== identity) {
    redisClient = new Redis({ url, token })
    redisIdentity = identity
  }

  return redisClient
}

function heartbeatKey(name: CronJobName): string {
  return `${CRON_HEARTBEAT.KEY_PREFIX}:${name}`
}

/**
 * 存进 Redis 的形状。跨进程的序列化边界一律当不可信输入解析——Upstash SDK
 * 会按写入类型自动 JSON 化/反 JSON 化，取回来的既可能是对象也可能是字符串。
 */
const StoredHeartbeatSchema = z.object({
  ok: z.boolean(),
  detail: z.string().nullable(),
  finishedAt: z.string(),
})

export type StoredHeartbeat = z.infer<typeof StoredHeartbeatSchema>

export interface CronRunOutcome {
  ok: boolean
  /** 一句人话，说明这次为什么失败或降级。成功时留空。 */
  detail?: string | null
}

export interface CronHeartbeat {
  name: CronJobName
  /** 从没上报过（key 不存在或已过 TTL）时为 null——这本身就是要报警的状态。 */
  lastRun: StoredHeartbeat | null
  ageMs: number | null
  /** 上次上报比 `MAX_AGE_MS` 还老，或压根没有过——说明至少漏跑了一次。 */
  stale: boolean
  healthy: boolean
}

/**
 * 记一次 cron 运行结果。
 *
 * ⛔ **永不抛错。** cron 的正事已经做完了，不能因为一次监控写入失败就把它的
 * 响应变成失败——那等于让观测手段反过来制造故障。写不进去就只留一条 error
 * 日志，下一次心跳照常覆盖。
 *
 * 未配置 Upstash（本地开发）时是干净的 no-op。
 */
export async function recordCronRun(
  name: CronJobName,
  outcome: CronRunOutcome,
): Promise<void> {
  const redis = getConfiguredRedis()
  if (!redis) return

  const payload: StoredHeartbeat = {
    ok: outcome.ok,
    detail: outcome.detail ?? null,
    finishedAt: new Date().toISOString(),
  }

  try {
    await redis.set(heartbeatKey(name), payload, {
      ex: CRON_HEARTBEAT.TTL_SECONDS,
    })
  } catch (error) {
    logger.error('Failed to record cron heartbeat', {
      cron: name,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function parseStored(raw: unknown): StoredHeartbeat | null {
  if (raw === null || raw === undefined) return null

  // Upstash SDK 依写入类型决定取回来的是对象还是字符串，两种都收。
  const candidate: unknown = typeof raw === 'string' ? safeJsonParse(raw) : raw

  const parsed = StoredHeartbeatSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 读全部三条 cron 的心跳。
 *
 * ⚠ 与 `recordCronRun` 相反，这里**故意会抛**：读不到就是「监控本身瞎了」，
 * 必须冒到 HTTP 层变成非 200，让 GitHub Action 开 issue。悄悄返回「一切正常」
 * 是这整件事要修的病，不能在修它的代码里再犯一次。
 */
export async function readCronHeartbeats(
  nowMs = Date.now(),
): Promise<CronHeartbeat[]> {
  const redis = getConfiguredRedis()
  if (!redis) {
    throw new Error(
      'Upstash Redis is not configured; cron heartbeats are unreadable.',
    )
  }

  const keys = CRON_JOB_NAMES.map(heartbeatKey)
  const values = await redis.mget<unknown[]>(...keys)

  return CRON_JOB_NAMES.map((name, index) => {
    const lastRun = parseStored(values?.[index])
    const finishedAtMs = lastRun ? Date.parse(lastRun.finishedAt) : Number.NaN
    const ageMs = Number.isFinite(finishedAtMs) ? nowMs - finishedAtMs : null
    const stale = ageMs === null || ageMs > CRON_HEARTBEAT.MAX_AGE_MS

    return {
      name,
      lastRun,
      ageMs,
      stale,
      healthy: !stale && lastRun !== null && lastRun.ok,
    }
  })
}
