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
 * 设计见 `docs/plans/canvas-video-domain-cleanup-2026-08-08.md` §8。三个要点：
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

const REFERENCE_MODE_TO_MODE: Record<VideoReferenceMode, VideoNodeMode> = {
  'text-or-first-frame': 'keyframe',
  'image-content-array': 'image-reference',
  'multimodal-reference': 'multimodal',
}

export const getReferenceModeForNodeMode = (
  mode: VideoNodeMode,
): VideoReferenceMode => MODE_TO_REFERENCE_MODE[mode]

/** 某个模型条目属于哪一档模式。 */
export function getNodeModeForModel(
  modelId: string,
  adapterType?: AI_ADAPTER_TYPES,
): VideoNodeMode {
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
