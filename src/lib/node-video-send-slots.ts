import type { VideoModelSendContract } from '@/constants/video-model-send-plan'

/**
 * 视频发送的**容量**：一次请求各类素材各能塞几条。
 *
 * ⚠ 这个模块存在的理由是「**一个真相**」。此前容量算了两遍：
 *
 *   · 预览层（`node-video-send-preview.ts`）按 `contract.slots` 算
 *   · 发送路径（`StudioNodeWorkbench`）按 `getMaxReferenceImages` 算，
 *     视频与音频甚至是写死的 `.slice(0, 3)`
 *
 * 后果不是「数字对不上」这么轻——多图参考档的 `slots.videos` 是 0，而发送路径照发
 * 三条视频，火山直接 400；预览说「这段视频不会发送」，实际发了。**界面说的和发出去
 * 的是两回事**，正是 cleanup §8.7 第 1 条警告的那件事。
 *
 * 两边现在调同一个函数。要改容量，只有这一个地方。
 */
export interface VideoSendSlotLimits {
  /** `Infinity` = 上游没公布硬上限，**不要**渲染成一个我们编的数字。 */
  images: number
  videos: number
  audio: number
  /**
   * 图片被砍掉是因为**跨模态总额**被视频/音频吃掉了，而不是图片本身到顶。
   * 决定超额图片的丢弃理由是 `total-limit` 还是 `model-limit` —— 两者对用户的
   * 下一步不同（前者去减视频/音频，后者只能换模型），所以判据留在这里算一次。
   */
  imagesLimitedByTotal: boolean
}

export function resolveVideoSendSlotLimits({
  contract,
  legacyMode,
  legacyMaxReferenceImages,
  audioCandidateCount,
  videoCandidateCount,
}: {
  contract: VideoModelSendContract
  /** 没选模型时没有契约可依，退回调用方给的老上限。 */
  legacyMode: boolean
  legacyMaxReferenceImages: number | undefined
  audioCandidateCount: number
  videoCandidateCount: number
}): VideoSendSlotLimits {
  const audio = legacyMode ? LEGACY_MEDIA_LIMIT : contract.slots.audio
  const videos = legacyMode ? LEGACY_MEDIA_LIMIT : contract.slots.videos

  // 跨模态总额（火山的「≤12 个文件」那类）：视频和音频先占，图片吃剩下的。
  // ⚠ 用**实际采用数**而不是候选数来扣减 —— 候选超了本来就发不出去，拿它扣会
  // 把图片的位置也一起吃掉。
  const usedAudio = Math.min(audioCandidateCount, audio)
  const usedVideos = Math.min(videoCandidateCount, videos)
  const remainingTotal =
    typeof contract.slots.total === 'number'
      ? Math.max(0, contract.slots.total - usedAudio - usedVideos)
      : Number.POSITIVE_INFINITY

  const configuredImages = legacyMode
    ? legacyMaxReferenceImages
    : contract.slots.images
  const configured =
    typeof configuredImages === 'number'
      ? configuredImages
      : Number.POSITIVE_INFINITY
  const images = Math.min(configured, remainingTotal)

  return {
    images,
    videos,
    audio,
    imagesLimitedByTotal: remainingTotal < configured,
  }
}

/** 没选模型时的兜底档，沿用改动前预览层与发送路径共同的写死值。 */
const LEGACY_MEDIA_LIMIT = 3
