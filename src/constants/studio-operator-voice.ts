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
 * 这一段是谁要念的（`/api/assistant/speak` 两个调用方，11-19）：落库时写进 `snapshot.speakSource`。
 * - `assistant_reply`：对话里 🔊 念她的回复 —— 素材库默认视图 ⛔ 显示（不刷屏），音频分段开关打开才看得见。
 * - `voice_bench`：配音台念台词 = 用户作品。缺省 / 不认识的一律按它算（保守：宁可多显示）。
 * ⚠ 配音台的台词列表（`listVoiceBenchLines`）照旧两种都列，按 voiceId 认，不看它。
 */
export const SPEAK_SOURCE = {
  ASSISTANT_REPLY: 'assistant_reply',
  VOICE_BENCH: 'voice_bench',
} as const

export const SPEAK_SOURCE_VALUES = [
  SPEAK_SOURCE.ASSISTANT_REPLY,
  SPEAK_SOURCE.VOICE_BENCH,
] as const

export type SpeakSource = (typeof SPEAK_SOURCE_VALUES)[number]

/** 生成记录 `snapshot` 里放来源的那个键。 */
export const SPEAK_SOURCE_SNAPSHOT_KEY = 'speakSource'

/**
 * 配音台（③，样件 v5）：只配现在这一位（全局人设那个角色）。⛔ 不另建台词表（用户 10-26）——
 * 台上列的就是素材库里她这副嗓子念过的音频，最近这么多条。
 */
export const VOICE_BENCH = {
  listLimit: 60,
  /** 一句台词的上限（一行就是一句；长段落去对话里让她念）。 */
  lineMaxChars: 500,
  /** 「按她说」一次最多改多少字（输入框里那几行加起来）。 */
  rewriteMaxChars: 2_000,
} as const
