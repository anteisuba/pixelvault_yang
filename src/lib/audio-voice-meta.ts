import { z } from 'zod'

import {
  SPEAK_SOURCE_VALUES,
  type SpeakSource,
} from '@/constants/studio-operator-voice'

/**
 * 音频产物「谁的嗓子」：Worker 那条路（Fish 带用户 key）上随队列元数据从提交一路带到落库。
 *
 * ⚠ 11-17 真机：Worker 回调落库时这三样全丢了 —— `snapshot.voiceId` 是配音台认台词的唯一判据
 * （`listVoiceBenchLines`），丢了 = 念好、扣了钱，台上却没有这一句；素材库那张卡也没了名字和头像。
 * 同步那条路（`generateAudioForUser`）写法与这里保持同形：`snapshot.voiceId` / `snapshot.voiceName` / `previewUrl`。
 */
export const AudioVoiceMetaSchema = z.object({
  voiceId: z.string().min(1).max(200).optional(),
  voiceName: z.string().trim().min(1).max(120).optional(),
  /** 音频封面（引用，不转存）；⛔ 叫 `previewUrl` —— 元数据里那个名字是出图的流式预览。 */
  audioCoverUrl: z.string().url().optional(),
  /**
   * 谁要念的（`/api/assistant/speak`，11-19）→ `snapshot.speakSource`：素材库靠它把助手念的回复
   * 挡在默认视图外。⚠ 坏值只丢这一格（`.catch`），⛔ 拖垮整份元数据 —— 落库还要靠它。
   */
  speakSource: z.enum(SPEAK_SOURCE_VALUES).optional().catch(undefined),
})

export type AudioVoiceMeta = z.infer<typeof AudioVoiceMetaSchema>

/** 落库时要写进 Generation 的那几样（没有的就不写）。 */
export function audioVoiceGenerationFields(meta: AudioVoiceMeta): {
  previewUrl?: string
  snapshot: { voiceId?: string; voiceName?: string; speakSource?: SpeakSource }
} {
  return {
    ...(meta.audioCoverUrl ? { previewUrl: meta.audioCoverUrl } : {}),
    snapshot: {
      ...(meta.voiceId ? { voiceId: meta.voiceId } : {}),
      ...(meta.voiceName ? { voiceName: meta.voiceName } : {}),
      ...(meta.speakSource ? { speakSource: meta.speakSource } : {}),
    },
  }
}
