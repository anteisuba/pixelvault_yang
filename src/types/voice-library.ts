import type { VoiceCardProvider } from '@/constants/voice-cards'

/**
 * 声音库的域类型。
 *
 * 单独成文件而不是塞进 `src/types/index.ts`：那是 333 个文件依赖的枢纽，
 * 一个只有声音库用得上的形状没有理由挤进去（`research.ts` / `voiceroom.ts`
 * 都是这个先例）。
 */

/**
 * 一副**公开音色**在库里的归一形态。
 *
 * 上游（今天只有 Fish Audio，将来可能有别家）各有各的 payload 形状，UI 不该认识
 * 它们中的任何一个——`mapFishVoiceToAsset` 之类的适配器把它们收敛到这里。
 *
 * ⚠ 这**不是** `VoiceCardRecord`：那是用户自己那张卡（收藏或克隆的，有 id、能
 * 删）。两者的关系是「公开音色被收藏之后，才会有一张卡」，靠
 * `voiceId + provider` 对上号。
 */
export interface VoiceAsset {
  /** `provider:voiceId` 拼出来的稳定前端 id，用于列表 key 与试听态。 */
  id: string
  /** 上游那边的音色 id（Fish 的 `reference_id`）。 */
  voiceId: string
  provider: VoiceCardProvider
  modelId: string
  title: string
  description: string | null
  languages: string[]
  tags: string[]
  author: string | null
  coverImage: string | null
  /** 上游自带的示例音频。⚠ 收藏时必须一起存进卡里，见 `useVoiceLibrary`。 */
  sampleUrl: string | null
  sampleText: string | null
  /** 渠道名的 i18n key（`voiceCardFishAudio` / `voiceCardFalF5Tts`）。 */
  sourceLabelKey: string
}

/**
 * 声音库的三个分栏。
 *
 * `favorites` 与 `cloned` **同属 VoiceCard**，靠 `referenceAudioUrl` 分流——
 * 有参考音频的是克隆卡。这条判据在 Prisma schema 的 `VoiceCard.sampleAudioUrl`
 * 注释里也钉着，两边不能各写一份。
 */
export const VOICE_LIBRARY_TABS = ['public', 'favorites', 'cloned'] as const

export type VoiceLibraryTab = (typeof VOICE_LIBRARY_TABS)[number]
