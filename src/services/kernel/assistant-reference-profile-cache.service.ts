import 'server-only'

import { createHash } from 'node:crypto'

import { Redis } from '@upstash/redis'

import { logger } from '@/lib/logger'
import {
  ReferenceVisualProfileSchema,
  type ReferenceVisualProfile,
} from '@/types/assistant-reference-analysis'

/**
 * 参考图视觉结论的**跨会话缓存**（owner 2026-10-08：「有些图片之前分析过，后面重新问
 * 还要再分析一轮吗」）。
 *
 * 此前结论只跟着会话走（客户端从这段对话的步骤里捡回来，最多 16 张）：换一个会话，
 * 同一组图就要重新看一遍 —— 马尔福画布开新对话后十张图重看，96 秒、3.6 万输入 token。
 *
 * ⭐ 键是「用户 + 语言 + 图片地址」：CDN 上的图按地址不可变，所以缓存不会过期失真；
 *   结论用哪种语言写取决于会话，换语言另存一份。
 * ⚠ 落点选 Upstash（与 `cron-heartbeat` 同理）：生产已是硬依赖，零迁移。
 * ⚠ 全程 fail-open：读写出错只记一行，回落到重新看图，⛔ 不让一次缓存故障挡住回答。
 */
const KEY_PREFIX = 'pv:ref-profile'
const TTL_SECONDS = 60 * 60 * 24 * 30

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

function profileKey(userId: string, language: string, url: string): string {
  const digest = createHash('sha256').update(url).digest('hex')
  return `${KEY_PREFIX}:${userId}:${language}:${digest}`
}

export interface ReferenceProfileStore {
  read(urls: readonly string[]): Promise<ReferenceVisualProfile[]>
  write(profiles: readonly ReferenceVisualProfile[]): Promise<void>
}

export function referenceProfileStore(
  userId: string,
  language: string,
): ReferenceProfileStore {
  return {
    async read(urls) {
      const redis = getConfiguredRedis()
      if (!redis || urls.length === 0) return []
      try {
        const values = await redis.mget<unknown[]>(
          ...urls.map((url) => profileKey(userId, language, url)),
        )
        return values.flatMap((value, index) => {
          const parsed = ReferenceVisualProfileSchema.safeParse(
            typeof value === 'string' ? JSON.parse(value) : value,
          )
          return parsed.success && parsed.data.url === urls[index]
            ? [parsed.data]
            : []
        })
      } catch (error) {
        logger.warn('reference profile cache read failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        })
        return []
      }
    },
    async write(profiles) {
      const redis = getConfiguredRedis()
      if (!redis || profiles.length === 0) return
      try {
        const pipeline = redis.pipeline()
        for (const profile of profiles)
          pipeline.set(
            profileKey(userId, language, profile.url),
            JSON.stringify(profile),
            { ex: TTL_SECONDS },
          )
        await pipeline.exec()
      } catch (error) {
        logger.warn('reference profile cache write failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        })
      }
    },
  }
}
