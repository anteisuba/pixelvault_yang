import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import {
  resolveVideoSendModelId,
  videoRailCapacity,
  videoSendMode,
  type VideoSendMode,
} from '@/constants/video-node-modes'

/**
 * 视频工作台左栏的**素材轨**（owner 2026-09-24 视频画板：去掉三个模式，按挂了什么判断）。
 *
 * ⭐ 一条轨放图、视频、音频，各自按挂上的顺序编号（图片1 · 视频1 · 音频1），与助手
 * 写进提示词的编号一一对应。首帧 / 尾帧只是图片上的角标。
 * ⭐ 这一枪走哪个端点、按哪种方式发，全部由挂了什么推出来 —— 与画布视频节点同一个
 * 判定函数（`videoSendMode` / `resolveVideoSendModelId`），⛔ 不许两处各推各的。
 *
 * ⚠ 状态沿用三份既有真相：首尾帧（`videoFrameSlots`）、参考图（`imageUpload`）、
 * 参考视频（`videoReferenceVideos`）、音频（`videoAudioRefs`）。这里只算，不存。
 */

export interface StudioVideoLoad {
  readonly first: string | null
  readonly last: string | null
  readonly references: readonly string[]
  readonly videos: readonly string[]
  readonly audios: number
}

export interface StudioVideoCapacity {
  /** 这个型号能放几张帧（0 = 不吃首尾帧，1 = 只有首帧，2 = 首 + 尾）。 */
  readonly frames: 0 | 1 | 2
  /**
   * 参考图能放几张。`null` = 上游没公布硬上限（Gemini），⛔ 不编一个数；
   * 0 = 这个型号在这条渠道上没有参考档。
   */
  readonly references: number | null
  readonly videos: number
  readonly audios: number
}

const EMPTY_CAPACITY: StudioVideoCapacity = {
  frames: 0,
  references: 0,
  videos: 0,
  audios: 0,
}

/**
 * 素材轨的容量 —— 全部来自**发送契约**，⛔ 不在这里另列一份模型表。
 *
 * ⚠ 参考那几格按「这个型号的**参考端点**」算（`videoRailCapacity`）：选中的是关键帧
 * 端点时视频 / 音频都是 0，照它算的话第一段参考视频永远挂不进来。
 */
export function getStudioVideoCapacity(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): StudioVideoCapacity {
  // 还没选模型 —— ⛔ 不猜一个默认模型的能力。
  if (!modelId) return EMPTY_CAPACITY

  const base = getVideoModelSendContract(modelId, adapterType)
  const frames =
    base.referenceMode === 'text-or-first-frame'
      ? base.keyframeSlots === 2
        ? 2
        : 1
      : 0

  // 只吃一组图片内容参考的型号（Gemini Omni Flash）：图就是参考，没有帧也没有音视频。
  if (base.referenceMode === 'image-content-array') {
    return {
      frames: 0,
      references: base.slots.images ?? null,
      videos: 0,
      audios: 0,
    }
  }

  const rail = videoRailCapacity({ modelId, adapterType })
  if (rail.referenceUnavailable) {
    return { frames, references: 0, videos: 0, audios: 0 }
  }
  return {
    frames,
    references: rail.images,
    videos: rail.videos ?? 0,
    audios: rail.voices ?? 0,
  }
}

export type StudioVideoImageRole = 'first' | 'last' | 'reference'

export interface StudioVideoImage {
  readonly url: string
  readonly role: StudioVideoImageRole
  /** 1 起的编号 —— 界面上的「图片N」，也是提示词里那张图的编号。 */
  readonly n: number
}

/**
 * 轨上图片的**显示顺序 = 编号 = 参考档下的发送顺序**：首帧、尾帧、再是参考图。
 * ⚠ 三处必须同序：界面写「图片2」而发出去的第二张是另一张，助手写的绑定句就指错了人。
 */
export function listStudioVideoImages(
  load: Pick<StudioVideoLoad, 'first' | 'last' | 'references'>,
): StudioVideoImage[] {
  const entries: { url: string; role: StudioVideoImageRole }[] = []
  if (load.first) entries.push({ url: load.first, role: 'first' })
  if (load.last) entries.push({ url: load.last, role: 'last' })
  for (const url of load.references) entries.push({ url, role: 'reference' })
  return entries.map((entry, index) => ({ ...entry, n: index + 1 }))
}

export interface StudioVideoSend {
  /** 这一枪实际跑的端点。 */
  readonly modelId: string
  readonly hasReference: boolean
  readonly mode: VideoSendMode
  /** 发出去的图（线上契约 `referenceImage` + `referenceImages` 由调用方铺开）。 */
  readonly images: readonly string[]
}

/**
 * 这一枪怎么发。
 *
 * ⭐ 有任何参考项（参考图 / 参考视频 / 音频）→ 参考端点，首尾帧也作为参考图随行
 * （与画布同一做法）；否则走关键帧端点，只发首帧（+ 尾帧）。
 * ⚠ 首帧缺席、只有尾帧时 ⛔ 不把尾帧顶到第一位：这种情况下两张都不发。
 */
export function resolveStudioVideoSend(
  modelId: string,
  adapterType: AI_ADAPTER_TYPES | undefined,
  load: StudioVideoLoad,
): StudioVideoSend {
  const hasReference =
    load.references.length > 0 || load.videos.length > 0 || load.audios > 0
  const mode = videoSendMode({
    firstFrame: load.first !== null,
    lastFrame: load.last !== null,
    referenceImages: load.references.length,
    videos: load.videos.length,
    voices: load.audios,
  })
  const images = hasReference
    ? listStudioVideoImages(load).map((image) => image.url)
    : load.first
      ? [load.first, load.last].filter(
          (url): url is string => typeof url === 'string',
        )
      : []
  return {
    modelId: resolveVideoSendModelId(modelId, adapterType, hasReference),
    hasReference,
    mode,
    images,
  }
}

export interface StudioVideoTokenFormat {
  /** 这个模型的原文写法（与各模型规则里的 token 同一套）。 */
  image(n: number): string
  video(n: number): string
  audio(n: number): string
  /** true = 写法带 `@` 前缀（MentionInput 的默认 token）；false = 按原文出现。 */
  prefixed: boolean
}

const AT_FORMAT: StudioVideoTokenFormat = {
  image: (n) => `Image${n}`,
  video: (n) => `Video${n}`,
  audio: (n) => `Audio${n}`,
  prefixed: true,
}

/**
 * 素材在提示词里的写法（owner 09-24「按模型写它自己的格式」，与
 * `model-strengths.media.ts` 各模型规则里的 token 逐一对应）。提示词框据它把正文里的
 * 编号渲染成缩略图胶囊，存储仍是原文。
 */
export function getStudioVideoTokenFormat(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): StudioVideoTokenFormat {
  if (!modelId) return AT_FORMAT
  const { family } = getVideoModelSendContract(modelId, adapterType)
  switch (family) {
    case 'seedance':
      // fal 文档写 @Image1；Ark（火山 / BytePlus）写 图片1。
      return adapterType === AI_ADAPTER_TYPES.FAL
        ? AT_FORMAT
        : {
            image: (n) => `图片${n}`,
            video: (n) => `视频${n}`,
            audio: (n) => `音频${n}`,
            prefixed: false,
          }
    case 'wan':
      return {
        image: (n) => `图${n}`,
        video: (n) => `视频${n}`,
        audio: (n) => `音频${n}`,
        prefixed: false,
      }
    case 'minimax':
      return {
        image: (n) => `Image ${n}`,
        video: (n) => `Video ${n}`,
        audio: (n) => `Audio ${n}`,
        prefixed: false,
      }
    case 'gemini':
      return {
        image: (n) => `<IMAGE_REF_${n - 1}>`,
        video: (n) => `Video ${n}`,
        audio: (n) => `Audio ${n}`,
        prefixed: false,
      }
    default:
      return AT_FORMAT
  }
}
