import { z } from 'zod'

import { STUDIO_OPERATOR_VOICE } from '@/constants/studio-operator-voice'
import { AUDIO_EMOTIONS } from '@/constants/voice-cards'

/**
 * 用她的嗓子念一段（对话里 🔊 念回复 ②c-2 / 配音台念台词 ③）：念哪段、用哪个型号（缺省 = 目录里第一个可用的）、
 * 什么情绪（配音台的「情绪」药丸；`none` / 不给 = 自动）。
 */
export const AssistantSpeakRequestSchema = z.object({
  text: z.string().trim().min(1).max(STUDIO_OPERATOR_VOICE.maxChars),
  modelId: z.enum(STUDIO_OPERATOR_VOICE.modelIds).optional(),
  emotion: z.enum(AUDIO_EMOTIONS).optional(),
})

export type AssistantSpeakRequest = z.infer<typeof AssistantSpeakRequestSchema>

export interface AssistantSpeakResponseData {
  jobId: string
}
