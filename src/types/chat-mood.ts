import { z } from 'zod'

import { CHAT_MOOD, CHAT_REPLY_MODES } from '@/constants/chat-voice'

/** 她此刻的心情（存在卡的 `extensions['pv.chatMood']`；⛔ 回给客户端）。 */
export const ChatMoodStateSchema = z.object({
  mood: z.string().trim().min(1).max(CHAT_MOOD.moodChars),
  intensity: z.number().int().min(0).max(CHAT_MOOD.maxIntensity),
  why: z.string().trim().max(CHAT_MOOD.noteChars),
  /** 什么时候定下的（ISO）：按真实时间消。 */
  at: z.string(),
})

export type ChatMoodState = z.infer<typeof ChatMoodStateSchema>

/** 模型写长了就截，⛔ 因此丢掉整个判断。 */
function clipped(max: number) {
  return z
    .string()
    .catch('')
    .transform((text) => text.trim().slice(0, max))
}

/** 回之前想的那一步：心情 + 怎么对你 + 回不回。 */
export const ChatPlanSchema = z.object({
  mood: clipped(CHAT_MOOD.moodChars).pipe(z.string().min(1)),
  intensity: z.coerce
    .number()
    .catch(0)
    .transform((value) =>
      Math.min(CHAT_MOOD.maxIntensity, Math.max(0, Math.round(value))),
    ),
  why: clipped(CHAT_MOOD.noteChars),
  stance: clipped(CHAT_MOOD.noteChars),
  reply: z.enum(CHAT_REPLY_MODES).catch('full'),
})

export type ChatPlan = z.infer<typeof ChatPlanSchema>
