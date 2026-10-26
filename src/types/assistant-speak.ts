import { z } from 'zod'

import { STUDIO_OPERATOR_VOICE } from '@/constants/studio-operator-voice'

/** 对话里 🔊 念她的回复（②c-2）：念哪段、用哪个型号（缺省 = 目录里第一个可用的）。 */
export const AssistantSpeakRequestSchema = z.object({
  text: z.string().trim().min(1).max(STUDIO_OPERATOR_VOICE.maxChars),
  modelId: z.enum(STUDIO_OPERATOR_VOICE.modelIds).optional(),
})

export type AssistantSpeakRequest = z.infer<typeof AssistantSpeakRequestSchema>

export interface AssistantSpeakResponseData {
  jobId: string
}
