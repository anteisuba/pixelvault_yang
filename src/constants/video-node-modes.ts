import { AI_MODELS, MODEL_OPTIONS, getModelVariant } from '@/constants/models'
import type { ModelOption } from '@/constants/models/types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getVideoModelSendContract,
  type VideoReferenceMode,
} from '@/constants/video-model-send-plan'

/**
 * 视频节点的**模式** —— 决定节点长什么样、走哪个端点、模型选择器里出现谁。
 *
 * 设计见 `docs/references/pages/canvas-video-card.md` §6。三个要点：
 *
 * 1. **模式归节点，不归模型选择器。** 选择器只负责在模式已定的前提下选
 *    系列 → 型号 → 渠道。
 * 2. **没有「全部」档。** 模式不只是筛选器，它还决定端点，而「全部」在端点
 *    决策上是空的（不知道该走 text-to-video 还是 reference-to-video）。
 * 3. **纯文生视频不是单独一档**，它是 `keyframe` 档下「两个槽都空」的自然状态。
 */
export const VIDEO_NODE_MODES = [
  'keyframe',
  'image-reference',
  'multimodal',
] as const

export type VideoNodeMode = (typeof VIDEO_NODE_MODES)[number]

/** 默认档：最通用，且所有主流视频模型都支持。 */
export const DEFAULT_VIDEO_NODE_MODE: VideoNodeMode = 'keyframe'

/**
 * 新建视频节点时的默认**型号**（`MODEL_VARIANTS` 的键）。
 *
 * 与旧的 brand+variant 双常量（`Seedance` + `fast`）等价，只是换成了目录的型号键
 * —— 那对旧常量分不开 2.0 与 2.5。渠道不写死：由用户手上有哪个 key 决定
 * （`pickDefaultVideoModel`）。
 */
export const DEFAULT_VIDEO_VARIANT = 'seedance-2.0-fast'

/**
 * 模式 ↔ 发送契约的 `referenceMode` 是**一一对应**的。
 *
 * 这是整套设计成立的关键：模式不需要自己的一套模型清单，它直接就是既有
 * `referenceMode` 的用户视角命名。加模型时不用登记模式，契约填对了模式自动正确。
 */
const MODE_TO_REFERENCE_MODE: Record<VideoNodeMode, VideoReferenceMode> = {
  keyframe: 'text-or-first-frame',
  'image-reference': 'image-content-array',
  multimodal: 'multimodal-reference',
}

/**
 * ⚠ 不是每个 `referenceMode` 都有对应的节点模式。`video-edit`（Kling O3 的
 * video-to-video/edit）映射到 `null`：它是**编辑入口**的端点，不是画布上的一档
 * 生成模式（目录里同样以 `videoKind: 'edit'` 表达这件事）。映射成 null 而不是
 * 硬塞进 multimodal，是为了让它在每一个按模式筛选的选择器里**消失**，而不是
 * 出现在一个它发不出正确请求的档里。UI 入口在设计阶段 D4 之后另接。
 */
const REFERENCE_MODE_TO_MODE: Record<VideoReferenceMode, VideoNodeMode | null> =
  {
    'text-or-first-frame': 'keyframe',
    'image-content-array': 'image-reference',
    'multimodal-reference': 'multimodal',
    'video-edit': null,
  }

export const getReferenceModeForNodeMode = (
  mode: VideoNodeMode,
): VideoReferenceMode => MODE_TO_REFERENCE_MODE[mode]

/** 某个模型条目属于哪一档模式；`null` = 不属于任何画布模式（编辑入口端点）。 */
export function getNodeModeForModel(
  modelId: string,
  adapterType?: AI_ADAPTER_TYPES,
): VideoNodeMode | null {
  const { referenceMode } = getVideoModelSendContract(modelId, adapterType)
  return REFERENCE_MODE_TO_MODE[referenceMode]
}

const VIDEO_OPTIONS = MODEL_OPTIONS.filter((m) => m.outputType === 'VIDEO')

/**
 * 某个模式下有哪些模型可选 —— 模型选择器的入口筛选。
 *
 * ⚠ 只返回 `available` 的。不符合当前模式的模型**直接消失**（owner 2026-08-08
 * 拍板），不是置灰 —— 所以这里过滤而非标记。
 */
export function getModelsForNodeMode(mode: VideoNodeMode): ModelOption[] {
  return VIDEO_OPTIONS.filter(
    (m) => m.available && getNodeModeForModel(m.id, m.adapterType) === mode,
  )
}

/** 某个型号在某个模式下支不支持（第二层是否出现）。 */
export function variantSupportsMode(
  variant: string,
  mode: VideoNodeMode,
): boolean {
  return getModelsForNodeMode(mode).some(
    (m) => getModelVariant(m.id) === variant,
  )
}

/**
 * ⭐ 端点解析：(型号 × 渠道 × 模式) → 唯一的 `AI_MODELS` 条目。
 *
 * 这是「用户只看见 Seedance 2.0、端点由模式挑」得以成立的那一步 ——
 * `SEEDANCE_20` 与 `SEEDANCE_20_REFERENCE` 是两个端点，用户不该感知，模式定了
 * 就该自动落到对的那个。
 *
 * 唯一性由 `models/model-variants.test.ts` 的不变量保证（同一 key 撞车会红）。
 * 找不到返回 null —— 调用方应当把该型号/渠道从列表里去掉，而不是回退到别的端点：
 * 回退意味着用户以为在用全能参考、实际发的是首帧请求。
 */
export function resolveVideoModelId(
  variant: string,
  adapterType: AI_ADAPTER_TYPES,
  mode: VideoNodeMode,
): AI_MODELS | null {
  const hit = getModelsForNodeMode(mode).find(
    (m) => getModelVariant(m.id) === variant && m.adapterType === adapterType,
  )
  return hit?.id ?? null
}

/**
 * ⚠ 2026-08-29 删掉了 `modelSurvivesModeSwitch`（台账 U）。它拿**端点 id** 回答
 * 「切档后这个模型还留不留」，而同一个型号在不同档下本来就是不同的端点 id
 * （`seedance-2.5-volcengine` / `seedance-2.5-reference-volcengine`）—— 于是它对
 * 每一次真正的切档都答 false，把用户刚选的 2.5 清成默认的 2.0 Fast。
 *
 * 正确的问法不是「留不留」而是「同一个型号 × 渠道在新档下走哪个端点」，答案在
 * `lib/video-node-model-resolver.ts` 的 `resolveVideoModelForMode` —— 提交链路与
 * 容量预览一直用的就是它，切档现在也走同一条（`useVideoComposer.selectMode`）。
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * 推出来的发送方式（画布 spec §5「不设模式页签」；工作台 owner 09-24 视频画板同一条）
 * ⭐ 画布视频节点与工作台左栏共用这一处 —— ⛔ 不许两处各推各的。
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * 这一次按哪种方式发 —— **由挂了什么推出来**，用户改不了（弹层顶部只读）。
 *
 * 优先级就是画板那句话：有任何参考项（参考图 / 参考视频 / 语音）→ 全能参考；
 * 首 + 尾 → 首尾帧；只有首帧 → 图生视频；什么都没挂 → 文生视频。
 */
export const VIDEO_SEND_MODE_IDS = {
  omniReference: 'omniReference',
  firstLastFrame: 'firstLastFrame',
  imageToVideo: 'imageToVideo',
  textToVideo: 'textToVideo',
} as const

export const VIDEO_SEND_MODES = [
  VIDEO_SEND_MODE_IDS.omniReference,
  VIDEO_SEND_MODE_IDS.firstLastFrame,
  VIDEO_SEND_MODE_IDS.imageToVideo,
  VIDEO_SEND_MODE_IDS.textToVideo,
] as const

export type VideoSendMode = (typeof VIDEO_SEND_MODES)[number]

/** 推模式只看这五个数 —— ⛔ 不看模型、不看参数。 */
export interface VideoSendModeCounts {
  readonly firstFrame: boolean
  readonly lastFrame: boolean
  readonly referenceImages: number
  readonly videos: number
  readonly voices: number
}

export function videoSendMode(counts: VideoSendModeCounts): VideoSendMode {
  if (counts.referenceImages > 0 || counts.videos > 0 || counts.voices > 0) {
    return VIDEO_SEND_MODE_IDS.omniReference
  }
  if (counts.firstFrame && counts.lastFrame) {
    return VIDEO_SEND_MODE_IDS.firstLastFrame
  }
  if (counts.firstFrame || counts.lastFrame) {
    return VIDEO_SEND_MODE_IDS.imageToVideo
  }
  return VIDEO_SEND_MODE_IDS.textToVideo
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 每组挂几项封顶（画板：满了加号灰、不藏）
 * ═════════════════════════════════════════════════════════════════════════ */

export interface VideoRailCapacity {
  /** `null` = 上游没公布硬上限，⛔ 不编一个数（Gemini 那一档）。 */
  readonly images: number | null
  readonly videos: number | null
  readonly voices: number | null
  /**
   * 这个型号在这条渠道上**没有参考变体** —— 挂参考视频 / 语音发不出去。
   * 加号灰 + 弹层说明，⛔ 不静默丢。
   */
  readonly referenceUnavailable: boolean
}

const UNKNOWN_CAPACITY: VideoRailCapacity = {
  images: null,
  videos: null,
  voices: null,
  referenceUnavailable: false,
}

/**
 * 轨上三组各自的上限 —— 数字全部来自**发送契约**（`video-model-send-plan.ts` 的
 * `VideoReferenceSlots`），⛔ 这里不另列一份。
 *
 * ⚠ 上限要按「这个型号在**全能参考**档下的那个端点」算，而不是当前选中的那条：
 * 空轨时选中的是关键帧端点（视频 / 语音都是 0），照它算的话第一段参考视频永远
 * 挂不进来。参考端点由 (型号 × 渠道 × 模式) 唯一确定（`resolveVideoModelId`），
 * 同渠道同 key，所以能选中关键帧档就能跑参考档。
 */
export function videoRailCapacity(
  model:
    | { readonly modelId: string; readonly adapterType?: AI_ADAPTER_TYPES }
    | undefined,
): VideoRailCapacity {
  if (!model?.modelId) return UNKNOWN_CAPACITY
  const base = getVideoModelSendContract(model.modelId, model.adapterType)
  const variant = getModelVariant(model.modelId)
  const referenceId = variant
    ? resolveVideoModelId(
        variant,
        model.adapterType as AI_ADAPTER_TYPES,
        'multimodal',
      )
    : null
  const reference = referenceId
    ? getVideoModelSendContract(referenceId, model.adapterType)
    : null

  // ⚠ `images: undefined` = 上游没公布硬上限（Gemini 那一档）—— 传成 `null`，
  // ⛔ 不当 0（那会把加号灰掉），也⛔ 不编一个数。
  const baseImages = base.slots.images
  const referenceImages = reference?.slots.images
  const images = reference
    ? baseImages === undefined || referenceImages === undefined
      ? null
      : Math.max(baseImages, referenceImages)
    : (baseImages ?? null)

  return {
    images,
    videos: reference?.slots.videos ?? base.slots.videos,
    voices: reference?.slots.audio ?? base.slots.audio,
    referenceUnavailable:
      reference === null && base.referenceMode !== 'multimodal-reference',
  }
}

/**
 * 型号 × 渠道 + 这一枪挂没挂参考项 → 实际跑的端点。
 *
 * ⭐ 挂了参考项（参考图 / 参考视频 / 音频）就走该型号的参考端点，否则走关键帧端点。
 * ⚠ 解析不到（这个型号在这条渠道上没有另一档）时**保留原选择**，⛔ 不回退到别的
 * 端点 —— 回退意味着用户以为在用全能参考、实际发的是首帧请求。
 */
export function resolveVideoSendModelId(
  modelId: string,
  adapterType: AI_ADAPTER_TYPES | undefined,
  hasReference: boolean,
): string {
  const variant = getModelVariant(modelId)
  if (!variant || !adapterType) return modelId
  return (
    resolveVideoModelId(
      variant,
      adapterType,
      hasReference ? 'multimodal' : 'keyframe',
    ) ?? modelId
  )
}

/**
 * 工作台模型选择器**一行一个型号 × 渠道**（owner 09-24 视频画板：去掉模式）。
 *
 * 关键帧端点代表这个型号；只有参考档的型号（Gemini Omni Flash）保留它自己；
 * 编辑入口端点（`video-edit`）不列 —— 它不是生成。
 */
export function isVideoPickerModel(
  modelId: string,
  adapterType: AI_ADAPTER_TYPES | undefined,
): boolean {
  const mode = getNodeModeForModel(modelId, adapterType)
  if (mode === null) return false
  if (mode === 'keyframe') return true
  const variant = getModelVariant(modelId)
  if (!variant || !adapterType) return true
  return resolveVideoModelId(variant, adapterType, 'keyframe') === null
}
