import 'server-only'

import { gunzipSync, gzipSync } from 'node:zlib'

import { Redis } from '@upstash/redis'
import type { ModelMessage } from 'ai'

import { logger } from '@/lib/logger'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

/**
 * 一轮跑到一半的样子（服务端存，接力时按轮号取回）。
 *
 * ── 为什么不再整份交给浏览器 ───────────────────────────────────────
 * 新内核每一步都把模型的**完整回复**原样接回去（思考、签名、联网结果）—— 思路才接得上。
 * 这一份动辄几百 KB，浏览器来回搬既慢又超请求上限；所以存在服务端（Redis，压缩，1 小时过期），
 * 接力时浏览器只带轮号（v3 本轮记录那条板子上的 `turn`）。
 * ⚠ 图在这里只存地址（`image` 是网址字符串），每一跳现下字节 —— 存字节就太大了。
 * ⚠ 取不回来（过期 / Redis 挂了）就从这一句重新开一轮，⛔ 不报错卡死。
 */
export interface NextTurnState {
  readonly turnId: string
  readonly hop: number
  /** 发给模型的整段：这一轮的用户消息 + 每一步的完整回复与工具结果。⛔ 不含系统提示与之前几轮的对白。 */
  readonly messages: ModelMessage[]
  /** v3 形状的本轮记录（过程记录表与评测读它）。 */
  readonly transcript: AssistantV3Transcript
  /** 这一轮用的是哪条接法（第一次被拒时换过就记着，接力那一跳不再试一遍）。 */
  readonly modelPath: string
  /** 这一轮用的型号。接力时创作者换了型号，旧型号的思考与联网记录不交给新型号。 */
  readonly modelId?: string
  /** 开轮时附在消息里的图的名字（look 认名字用）。 */
  readonly attachedNames: readonly string[]
  readonly latestUserText: string
  /** 时间线上的步号接着往下排。 */
  readonly stepSeq: number
}

const KEY_PREFIX = 'antei:assistant-next:turn'
const TTL_SECONDS = 60 * 60
/** 压缩后超过这个数就不存了（Upstash 单条请求上限 1MB，留余量）。 */
const MAX_STORED_BYTES = 900_000
const MAX_MEMORY_ENTRIES = 50

const memory = new Map<string, { value: string; expiresAt: number }>()

let client: Redis | null = null
let identity = ''

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const next = `${url}\u0000${token}`
  if (!client || identity !== next) {
    client = new Redis({ url, token })
    identity = next
  }
  return client
}

function keyOf(userId: string, turnId: string): string {
  return `${KEY_PREFIX}:${userId}:${turnId}`
}

export function encodeTurnState(state: NextTurnState): string {
  return gzipSync(Buffer.from(JSON.stringify(state), 'utf8')).toString('base64')
}

export function decodeTurnState(value: string): NextTurnState | null {
  try {
    const parsed = JSON.parse(
      gunzipSync(Buffer.from(value, 'base64')).toString('utf8'),
    ) as NextTurnState
    return Array.isArray(parsed.messages) && typeof parsed.turnId === 'string'
      ? parsed
      : null
  } catch {
    return null
  }
}

export async function saveTurnState(
  userId: string,
  state: NextTurnState,
): Promise<boolean> {
  const value = encodeTurnState(state)
  if (value.length > MAX_STORED_BYTES) {
    logger.warn('assistant next turn state too large to keep', {
      userId,
      turnId: state.turnId,
      bytes: value.length,
    })
    return false
  }
  const key = keyOf(userId, state.turnId)
  const store = redis()
  if (store) {
    try {
      await store.set(key, value, { ex: TTL_SECONDS })
      return true
    } catch (error) {
      logger.warn('assistant next turn state not saved', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
  const now = Date.now()
  for (const [entry, held] of memory)
    if (held.expiresAt <= now || memory.size >= MAX_MEMORY_ENTRIES)
      memory.delete(entry)
  memory.set(key, { value, expiresAt: now + TTL_SECONDS * 1000 })
  return true
}

export async function loadTurnState(
  userId: string,
  turnId: string,
): Promise<NextTurnState | null> {
  const key = keyOf(userId, turnId)
  const store = redis()
  if (store) {
    try {
      const value = await store.get<string>(key)
      return typeof value === 'string' ? decodeTurnState(value) : null
    } catch (error) {
      logger.warn('assistant next turn state not loaded', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
  const held = memory.get(key)
  if (!held || held.expiresAt <= Date.now()) return null
  return decodeTurnState(held.value)
}
