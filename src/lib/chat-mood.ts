import { CHAT_MOOD } from '@/constants/chat-voice'
import {
  ChatMoodStateSchema,
  ChatPlanSchema,
  type ChatMoodState,
  type ChatPlan,
} from '@/types/chat-mood'

/**
 * **她此刻的心情**（10-31 owner「聊天加入这三层」）：纯函数——读 / 消 / 解析那一步想出来的 / 定规矩。
 * 读库、调模型在 `character-chat-mood.service`；怎么写进这一轮的提醒在 `prompt.ts` 的 `chatReminder`。
 */

const HOUR_MS = 3_600_000

/** 卡上存着的那份（没有、坏了都当没有）。 */
export function readChatMood(extensions: unknown): ChatMoodState | null {
  if (!extensions || typeof extensions !== 'object') return null
  const raw = (extensions as Record<string, unknown>)[CHAT_MOOD.extensionKey]
  const parsed = ChatMoodStateSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** 按真实时间消：每 `fadeHours` 小时降一档，降到 0 = 平静（`null`）。 */
export function fadeChatMood(
  state: ChatMoodState | null,
  now: Date,
): (ChatMoodState & { hoursAgo: number }) | null {
  if (!state) return null
  const at = Date.parse(state.at)
  const hoursAgo = Number.isFinite(at)
    ? Math.max(0, (now.getTime() - at) / HOUR_MS)
    : Number.POSITIVE_INFINITY
  const intensity = state.intensity - Math.floor(hoursAgo / CHAT_MOOD.fadeHours)
  if (intensity <= 0) return null
  return { ...state, intensity, hoursAgo }
}

/**
 * 她连着没回你几句：最后一句她说的话之后你发了几句，减去你刚发的这一句。
 * 空白的助手行（出错、被打断、她没回）不算她说过话。
 */
export function silentRunOf(
  messages: readonly { role: string; content: string }[],
): number {
  let mine = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!
    if (message.role === 'user') mine += 1
    else if (message.content.trim()) break
  }
  return Math.max(0, mine - 1)
}

/** 那一步的回答 → 计划；读不出来 = `null`（照常回）。 */
export function parseChatPlan(raw: string): ChatPlan | null {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = ChatPlanSchema.safeParse(
      JSON.parse(cleaned.slice(start, end + 1)),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * 守规矩：「不回」只在真不高兴时作数，连着不回到上限就至少回一两个字（owner 10-31「最多连着不理两次」）。
 */
export function settleChatPlan(plan: ChatPlan, silentRun: number): ChatPlan {
  if (plan.reply !== 'none') return plan
  if (plan.intensity < CHAT_MOOD.silentMinIntensity)
    return { ...plan, reply: 'brief' }
  if (silentRun >= CHAT_MOOD.maxSilentRun) return { ...plan, reply: 'brief' }
  return plan
}

/** 计划 → 存回卡上的那份（平静了就清掉）。 */
export function chatMoodFromPlan(
  plan: ChatPlan,
  now: Date,
): ChatMoodState | null {
  if (plan.intensity <= 0) return null
  return {
    mood: plan.mood,
    intensity: plan.intensity,
    why: plan.why,
    at: now.toISOString(),
  }
}
