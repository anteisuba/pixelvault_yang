import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * 关键帧档的**发送选图**（切片 6 第 ⑤ 层的守卫）。
 *
 * 火山的三个场景互斥，关键帧端点只认 first_frame / last_frame 两个位置 —— 适配器因此
 * 按位置取：images[0]=首帧、images[1]=尾帧。这条位置约定只有在**到达适配器的就是那两张
 * 关键帧**时才成立。
 *
 * 而收割是「关键帧在前，其余参考图跟在后面」：
 *
 *   1 张首帧 + 1 张角色卡图  →  urls = [首帧, 角色图]
 *
 * 适配器按位置取就会把**角色图当成尾帧**发出去 —— 视频以一张不相干的图结尾。这就是这个
 * 函数存在的唯一理由：把「哪些是关键帧」这件只有图结构知道的事，在发送前定死，别让适配器
 * 去猜。语义的载体是分类（`imageCategory`），位置只是它的投影。
 *
 * ⚠ 只在**关键帧档且支持两个槽**的模型上改变行为，其余模型原样返回。参考档（多模态）走
 * 的是另一个场景，不谈首尾；单槽模型（`keyframeSlots: 1`）本来就只有 provider 读第一张，
 * 这里不去动它 —— 那是另一件事，不该搭在这一刀里。
 */
export interface VideoKeyframePlan {
  /** 实际要发出去的图，顺序即语义。 */
  imageUrls: string[]
  /** 因为「当前模式下发不出去」而被留下的图，用来给用户提示，不是静默丢弃。 */
  dropped: string[]
}

export function planVideoKeyframeImages({
  imageUrls,
  keyframeUrls,
  modelId,
  adapterType,
}: {
  /** 已经过 dedup + cap 的候选图，顺序是收割顺序（关键帧在前）。 */
  imageUrls: readonly string[]
  /** 收割层标出来的关键帧（首→尾），是 `imageUrls` 的子集。 */
  keyframeUrls: readonly string[]
  modelId: string | undefined
  adapterType?: AI_ADAPTER_TYPES
}): VideoKeyframePlan {
  const contract = getVideoModelSendContract(modelId, adapterType)
  const supportsFirstLast =
    contract.referenceMode === 'text-or-first-frame' &&
    contract.keyframeSlots === 2
  if (!supportsFirstLast) {
    return { imageUrls: [...imageUrls], dropped: [] }
  }

  // 只认还活在候选里的关键帧：cap / @ 过滤可能已经把某张切掉了，选一张没发出去的图
  // 当尾帧，等于凭空发明了一帧。
  const survivingKeyframes = keyframeUrls.filter((url) =>
    imageUrls.includes(url),
  )

  // 用户一张都没标 → 经典 i2v：第一张当首帧。这是关键帧档一直以来的行为，别改。
  const chosen =
    survivingKeyframes.length > 0
      ? survivingKeyframes.slice(0, 2)
      : imageUrls.slice(0, 1)

  const chosenSet = new Set(chosen)
  return {
    imageUrls: chosen,
    dropped: imageUrls.filter((url) => !chosenSet.has(url)),
  }
}
