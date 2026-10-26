import { AI_MODELS } from '@/constants/models'

/**
 * 对话里 🔊 念她的回复（②c-2，样件 v5 语音条）。
 *
 * 型号三档按钮从左到右：免费 · Pro · Drama 3（Drama 3 念得出方括号语气）。
 */
export const STUDIO_OPERATOR_VOICE = {
  modelIds: [
    AI_MODELS.FISH_AUDIO_S2_PRO_FREE,
    AI_MODELS.FISH_AUDIO_S2_PRO,
    AI_MODELS.FISH_AUDIO_DRAMA_3,
  ],
  defaultModelId: AI_MODELS.FISH_AUDIO_S2_PRO_FREE,
  /** 一段回复念的上限（和回复本身的上限同一量级；再长就是该拆的长文了）。 */
  maxChars: 4000,
  /** 等念好：隔多久问一次、最多问几次（Fish 一般十秒内回来）。 */
  pollMs: 1500,
  pollMaxTries: 80,
  /** 开关和型号记在这台设备上。 */
  storageKey: 'antei.operator-voice',
} as const

export type StudioOperatorVoiceModelId =
  (typeof STUDIO_OPERATOR_VOICE.modelIds)[number]

/**
 * 配音台（③，样件 v5）：只配现在这一位（全局人设那个角色）。⛔ 不另建台词表（用户 10-26）——
 * 台上列的就是素材库里她这副嗓子念过的音频，最近这么多条。
 */
export const VOICE_BENCH = {
  listLimit: 60,
  /** 一句台词的上限（一行就是一句；长段落去对话里让她念）。 */
  lineMaxChars: 500,
} as const
