import { z } from 'zod'

import { VOICE_BENCH } from '@/constants/studio-operator-voice'

/** 配音台上的一句（③）：就是素材库里她这副嗓子念出来的那条音频。 */
export const VoiceBenchLineSchema = z.object({
  id: z.string(),
  /** 念的字，带句首的方括号语气（`[whispering] 嘘……`）。 */
  text: z.string(),
  url: z.string(),
  duration: z.number().nullable(),
  createdAt: z.string(),
})

export type VoiceBenchLine = z.infer<typeof VoiceBenchLineSchema>

export interface VoiceBenchData {
  /** 现在这一位的角色卡；默认助手 = null（没有嗓子，配不了）。 */
  characterCardId: string | null
  /** 她绑的音色卡；没绑 = null（先挑一副）。 */
  voiceCardId: string | null
  /** 旧的在前（台词从上往下读，最新的一句挨着输入框）。 */
  lines: VoiceBenchLine[]
}

/** 「按她说」（③-2a）：把输入框里那几行改成她的口吻，改完回到输入框（⛔ 直接念）。 */
export const VoiceBenchRewriteRequestSchema = z.object({
  text: z.string().trim().min(1).max(VOICE_BENCH.rewriteMaxChars),
})

export type VoiceBenchRewriteRequest = z.infer<
  typeof VoiceBenchRewriteRequestSchema
>

export interface VoiceBenchRewriteData {
  text: string
}
