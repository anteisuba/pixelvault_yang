import { z } from 'zod'

import { TTS_SPEED_RANGE } from '@/constants/audio-options'
import {
  SPEAK_SOURCE_VALUES,
  STUDIO_OPERATOR_VOICE,
} from '@/constants/studio-operator-voice'

/**
 * 用她的嗓子念一段（对话里 🔊 念回复 ②c-2 / 配音台念台词 ③）：念哪段、用哪个型号（缺省 = 目录里第一个可用的）。
 * 语气写在字里（`[happy]`，配音台「语气」菜单插的），⛔ 另给情绪参数。
 */
export const AssistantSpeakRequestSchema = z.object({
  text: z.string().trim().min(1).max(STUDIO_OPERATOR_VOICE.maxChars),
  modelId: z.enum(STUDIO_OPERATOR_VOICE.modelIds).optional(),
  /** 语速（配音台「语速」药丸，和画布音频节点同一个值域）；不给 / 1.0 = 默认念法。 */
  speed: z
    .number()
    .min(TTS_SPEED_RANGE.min)
    .max(TTS_SPEED_RANGE.max)
    .optional(),
  /**
   * 谁要念的（落进 `snapshot.speakSource`）：对话念回复 = `assistant_reply`（素材库默认不显示），
   * 配音台 = `voice_bench`。不给 / 不认识 = 按 `voice_bench`（用户作品）算 —— 保守：宁可在素材库
   * 多显示一条，⛔ 因为来源字段写错就整段念不了。
   */
  source: z.enum(SPEAK_SOURCE_VALUES).optional().catch(undefined),
  /**
   * 配音台本次的临时音色（声音库「用这副嗓子配音」/ 做同款带来的原音色）：给了就用这副念，
   * ⛔ 改角色卡绑定；不给 = 角色绑的那副。归属由服务端按 userId 查卡校验。
   */
  voiceCardId: z.string().trim().min(1).max(64).optional(),
})

export type AssistantSpeakRequest = z.infer<typeof AssistantSpeakRequestSchema>

export interface AssistantSpeakResponseData {
  jobId: string
}
