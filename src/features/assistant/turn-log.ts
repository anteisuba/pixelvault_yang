import 'server-only'

import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import {
  AssistantOperatorEventSchema,
  type AssistantOperatorEvent,
} from '@/types/assistant-operator'
import { logger } from '@/lib/logger'
import { assistantRedis } from '@/features/assistant/state'

/**
 * 一轮的**事件日志**（回合托管第 1 片，`docs/references/assistant-durable-turns.md` §2）。
 *
 * ⭐ 浏览器只是这份日志的一个读者：在线时实时收，断了回来按序号补放、再接着收。
 * ⚠ 增量（`message_delta`、带摘要的 `thinking`）⛔ 进日志：不是真值、量大。正在写的那段话
 *   另存一份「草稿」，补放时作为一次增量发出；定稿以 `message` 帧为准。
 * ⚠ 全部 1 小时过期，与轮状态（`state.ts`）同寿命。Redis 没配（开发 / 测试）退回进程内存。
 * ⚠ 键按 Clerk 用户 id 分：路由与补放接口手上都是它，⛔ 别人的轮号碰不到这几行。
 */

const PREFIX = 'antei:assistant-next'
const TTL_SECONDS = 60 * 60
/** 停止标记活多久：⏹ 之后这一轮最多再跑到下一个停点。 */
const STOP_TTL_SECONDS = 10 * 60
const MAX_MEMORY_KEYS = 200

export interface LoggedTurnEvent {
  readonly seq: number
  readonly event: AssistantOperatorEvent
}

type MemoryValue = { value: unknown; expiresAt: number }
const memory = new Map<string, MemoryValue>()

function memoryGet(key: string): unknown {
  const held = memory.get(key)
  if (!held) return null
  if (held.expiresAt <= Date.now()) {
    memory.delete(key)
    return null
  }
  return held.value
}

function memorySet(key: string, value: unknown, ttlSeconds: number) {
  if (memory.size >= MAX_MEMORY_KEYS && !memory.has(key)) {
    const oldest = memory.keys().next().value
    if (oldest !== undefined) memory.delete(oldest)
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

const eventsKey = (owner: string, turnId: string) =>
  `${PREFIX}:events:${owner}:${turnId}`
const draftKey = (owner: string, turnId: string) =>
  `${PREFIX}:draft:${owner}:${turnId}`
const activeKey = (owner: string, conversationId: string) =>
  `${PREFIX}:active:${owner}:${conversationId}`
const stopKey = (owner: string, turnId: string) =>
  `${PREFIX}:stop:${owner}:${turnId}`

/** 这一帧进不进日志（增量不进，见头注）。 */
export function isLoggedTurnEvent(event: AssistantOperatorEvent): boolean {
  if (event.type === ASSISTANT_OPERATOR_EVENTS.messageDelta) return false
  if (event.type === ASSISTANT_OPERATOR_EVENTS.thinking && event.delta)
    return false
  return true
}

function warn(what: string, error: unknown) {
  logger.warn(`assistant turn log: ${what}`, {
    error: error instanceof Error ? error.message : String(error),
  })
}

/** 追加一帧，回它的序号（从 1 起）；写不进去回 `null`（⛔ 抛：日志坏了不该拖垮这一轮）。 */
export async function appendTurnEvent(
  owner: string,
  turnId: string,
  event: AssistantOperatorEvent,
): Promise<number | null> {
  const key = eventsKey(owner, turnId)
  const store = assistantRedis()
  if (store) {
    try {
      const seq = await store.rpush(key, JSON.stringify(event))
      // 续命不必每帧都续：头一帧与之后每 20 帧一次。
      if (seq % 20 === 1) await store.expire(key, TTL_SECONDS)
      return seq
    } catch (error) {
      warn('append failed', error)
      return null
    }
  }
  const list = (memoryGet(key) as unknown[] | null) ?? []
  list.push(JSON.stringify(event))
  memorySet(key, list, TTL_SECONDS)
  return list.length
}

function parseEvent(raw: unknown): AssistantOperatorEvent | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parsed = AssistantOperatorEventSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** 序号 `after` 之后的全部帧（`after` = 0 读整份）。 */
export async function readTurnEvents(
  owner: string,
  turnId: string,
  after: number,
): Promise<LoggedTurnEvent[]> {
  const key = eventsKey(owner, turnId)
  const store = assistantRedis()
  let raw: unknown[] = []
  if (store) {
    try {
      raw = await store.lrange(key, after, -1)
    } catch (error) {
      warn('read failed', error)
      return []
    }
  } else {
    raw = ((memoryGet(key) as unknown[] | null) ?? []).slice(after)
  }
  return raw.flatMap((item, index) => {
    const event = parseEvent(item)
    return event ? [{ seq: after + index + 1, event }] : []
  })
}

/** 正在写的那段话（`null` = 写完了 / 换下一段，删掉）。 */
export async function writeTurnDraft(
  owner: string,
  turnId: string,
  text: string | null,
): Promise<void> {
  const key = draftKey(owner, turnId)
  const store = assistantRedis()
  if (store) {
    try {
      if (text === null) await store.del(key)
      else await store.set(key, text, { ex: TTL_SECONDS })
    } catch (error) {
      warn('draft failed', error)
    }
    return
  }
  if (text === null) memory.delete(key)
  else memorySet(key, text, TTL_SECONDS)
}

export async function readTurnDraft(
  owner: string,
  turnId: string,
): Promise<string | null> {
  const key = draftKey(owner, turnId)
  const store = assistantRedis()
  if (store) {
    try {
      const value = await store.get<string>(key)
      return typeof value === 'string' ? value : null
    } catch (error) {
      warn('draft read failed', error)
      return null
    }
  }
  const value = memoryGet(key)
  return typeof value === 'string' ? value : null
}

/** 这段会话此刻在跑的轮（开跑写、终态删）。 */
export async function markActiveTurn(
  owner: string,
  conversationId: string,
  turnId: string,
): Promise<void> {
  const key = activeKey(owner, conversationId)
  const store = assistantRedis()
  if (store) {
    try {
      await store.set(key, turnId, { ex: TTL_SECONDS })
    } catch (error) {
      warn('mark active failed', error)
    }
    return
  }
  memorySet(key, turnId, TTL_SECONDS)
}

/** 只删还是这一轮的标记：插话后新一轮已经写了自己的号，⛔ 被旧一轮收尾时抹掉。 */
export async function clearActiveTurn(
  owner: string,
  conversationId: string,
  turnId: string,
): Promise<void> {
  const key = activeKey(owner, conversationId)
  if ((await readActiveTurn(owner, conversationId)) !== turnId) return
  const store = assistantRedis()
  if (store) {
    try {
      await store.del(key)
    } catch (error) {
      warn('clear active failed', error)
    }
    return
  }
  memory.delete(key)
}

export async function readActiveTurn(
  owner: string,
  conversationId: string,
): Promise<string | null> {
  const key = activeKey(owner, conversationId)
  const store = assistantRedis()
  if (store) {
    try {
      const value = await store.get<string>(key)
      return typeof value === 'string' ? value : null
    } catch (error) {
      warn('read active failed', error)
      return null
    }
  }
  const value = memoryGet(key)
  return typeof value === 'string' ? value : null
}

/** ⏹ / 插话：落一个停止标记，跑着的那一轮在下一次查的时候停下。 */
export async function requestTurnStop(
  owner: string,
  turnId: string,
): Promise<void> {
  const key = stopKey(owner, turnId)
  const store = assistantRedis()
  if (store) {
    try {
      await store.set(key, '1', { ex: STOP_TTL_SECONDS })
    } catch (error) {
      warn('stop failed', error)
    }
    return
  }
  memorySet(key, '1', STOP_TTL_SECONDS)
}

export async function turnStopRequested(
  owner: string,
  turnId: string,
): Promise<boolean> {
  const key = stopKey(owner, turnId)
  const store = assistantRedis()
  if (store) {
    try {
      return (await store.get(key)) !== null
    } catch (error) {
      warn('stop read failed', error)
      return false
    }
  }
  return memoryGet(key) !== null
}
