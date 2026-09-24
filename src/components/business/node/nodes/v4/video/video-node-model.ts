/**
 * 视频节点的**纯读函数**（v3 spec §5，画板 `VideoStates` / `VideoSelected` /
 * `VideoPopover` / `VideoExpanded` / `VideoQuickLook`）。
 *
 * 卡高 / 版本表 / 画面弹层的三段档位 / 声音开关能不能点 / 底部读数与估价，全在这里
 * 算完再交给组件 —— ⛔ 组件里不再出现第二份算术（图片节点的同一条纪律）。
 *
 * ⚠ 档位值域来自**能力表**（`getVideoModelCapabilities`），⛔ 不在这里另列一份：
 * 模型加一档时长时这里自动跟上。不支持的档**灰掉不隐藏**（Hard Rule 8）——换模型
 * 时弹层不会莫名变矮一截，用户看得见「这个模型没有 4K」。
 */

import {
  formatUnitPriceAmount,
  getVideoUnitPricePerSecond,
} from '@/constants/models/unit-prices'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import {
  getVideoModelCapabilities,
  snapVideoDuration,
  snapVideoResolution,
} from '@/constants/video-model-capabilities'
import {
  isVideoResolution,
  type VideoResolution,
} from '@/constants/video-options'
import { readOutputVersions } from '@/lib/node-output-versions'
import type {
  NodeV4GenerationParams,
  NodeV4VideoData,
} from '@/types/node-workflow'

/**
 * 卡高：**永远 16:9**（spec §5「16:9 空卡；有片时卡即封面」）。
 *
 * ⚠ 与图片卡的「按真实比例」不同 —— 视频卡的比例是**参数**（用户在弹层里选的那个
 * 比例才是这段片子将要长成的样子），⛔ 不按回填的 `mediaWidth/Height` 变形：那会让
 * 一张卡在生成回来的那一刻跳一次形状。
 */
export function videoCardHeight(width: number): number {
  return Math.round((width * 9) / 16)
}

/**
 * 这张卡交付过的每一版的地址（spec §1.8）—— 版本点唯一的读侧。
 * 存量卡（只有裸 `url`）在 `readOutputVersions` 那一层已经被当成一版了。
 */
export function videoVersions(data: NodeV4VideoData): readonly string[] {
  return readOutputVersions(data).map((version) => version.url)
}

/**
 * 「生成声音」这个开关能不能点。
 *
 * ⚠ 判据是**发送契约**（`getVideoModelSendContract().parameters.generateAudio`）
 * 而不是「上游支不支持」：这个字段发不发得出去由 worker 的 builder 决定，声明得比
 * 实现宽，用户打开了开关也只会被静默丢掉。
 */
export function videoSupportsGeneratedAudio(
  modelId: string | undefined,
): boolean {
  if (!modelId) return false
  return getVideoModelSendContract(modelId).parameters.generateAudio
}

/**
 * 新卡的默认参数（画板：参数 chip 永不为空）。
 *
 * 三档各取这个模型能力表里的第一个可用值：比例 / 清晰度优先 `16:9` / `720p`
 * ——它们是画板上写的那两个默认，模型没有时才退到表里的第一档。
 */
export function videoDefaultParams(
  modelId: string | undefined,
): NodeV4GenerationParams {
  if (!modelId) return {}
  const capabilities = getVideoModelCapabilities(modelId)
  const durations = [...(capabilities.supportedDurations ?? [])].sort(
    (a, b) => a - b,
  )
  const ratios = capabilities.supportedAspectRatios ?? []
  const resolutions = capabilities.supportedResolutions ?? []
  const pick = (preferred: string, all: readonly string[]) =>
    all.includes(preferred) ? preferred : all[0]
  const duration = durations[0]
  const aspectRatio = pick('16:9', ratios)
  const resolution = pick('720p', resolutions)
  return {
    ...(duration === undefined ? {} : { duration: String(duration) }),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
  }
}

/** 存量卡上缺的档补上默认 —— 显示与发送读的是同一份。 */
export function videoEffectiveParams(
  params: NodeV4GenerationParams | undefined,
  modelId: string | undefined,
): NodeV4GenerationParams {
  const defaults = videoDefaultParams(modelId)
  const merged: NodeV4GenerationParams = { ...defaults, ...params }
  if (!modelId) return merged

  const capabilities = getVideoModelCapabilities(modelId)
  const seconds = Number(merged.duration)
  if (
    Number.isFinite(seconds) &&
    seconds > 0 &&
    (capabilities.supportedDurations?.length ?? 0) > 0
  ) {
    merged.duration = String(snapVideoDuration(modelId, seconds))
  }

  const ratios = capabilities.supportedAspectRatios ?? []
  if (
    merged.aspectRatio &&
    ratios.length > 0 &&
    !ratios.includes(merged.aspectRatio as (typeof ratios)[number])
  ) {
    merged.aspectRatio = defaults.aspectRatio
  }

  if (merged.resolution) {
    merged.resolution = snapVideoResolution(
      modelId,
      merged.resolution as VideoResolution,
    )
  }

  return merged
}

function readResolution(
  params: NodeV4GenerationParams | undefined,
): VideoResolution | null {
  const value = params?.resolution
  return value && isVideoResolution(value) ? value : null
}

function readDurationSeconds(
  params: NodeV4GenerationParams | undefined,
): number | null {
  const parsed = Number(params?.duration)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * 提示词栏上那颗参数 chip 的字：`全能参考 · 15s · 16:9 · 720p`，开了声音再接
 * 「· 有声」（画板 `VideoRefs.dc.html` 方向 A）。
 *
 * ⚠ 首位是**推出来的模式**（`modeLabel`，没选模型时不给）；译文全部由调用方传
 * ——这一层不认识 i18n。缺哪一截就不写那一截，⛔ 不编一个默认值顶上去：chip 上
 * 写的每个数都必须是真的会发出去的那个。整条都空时退回 `fallback`（没模型时那
 * 是「选模型」）。
 */
export function videoFrameChipLabel(
  params: NodeV4GenerationParams | undefined,
  options: {
    readonly modeLabel?: string
    readonly audioLabel?: string
    readonly fallback: string
  },
): string {
  const seconds = readDurationSeconds(params)
  const parts = [
    options.modeLabel ?? null,
    seconds === null ? null : formatVideoSeconds(seconds),
    params?.aspectRatio ?? null,
    params?.resolution ?? null,
    params?.generateAudio ? (options.audioLabel ?? null) : null,
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : options.fallback
}

/** `7s`。⛔ 不引 date 库：这里只有一种格式。 */
export function formatVideoSeconds(seconds: number): string {
  return `${Math.round(seconds)}s`
}

/** `m:ss` 读数（播放器的时钟）。 */
export function formatVideoClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * 清晰度档 → 短边像素。⚠ 只用来在弹层底部**读**一行尺寸：真正发出去的是
 * `resolution` 这个档名本身，长宽由上游按比例算。⛔ 不拿它去构造载荷。
 */
const RESOLUTION_SHORT_EDGE: Readonly<Record<VideoResolution, number>> = {
  '480p': 480,
  '540p': 540,
  '720p': 720,
  '1080p': 1080,
  '2k': 1440,
}

/** `16:9` → `[16, 9]`；认不出来返回 null（⛔ 不猜一个 16:9 顶上）。 */
function parseAspectRatio(value: string | undefined): [number, number] | null {
  const match = /^(\d+):(\d+)$/.exec(value ?? '')
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  return [width, height]
}

/**
 * 这一次大概花多少：**每秒单价 × 时长**。
 *
 * ⚠ 每秒单价按**用户选中的那一档清晰度**取（`getVideoUnitPricePerSecond`）——
 * 没核实过的档它返回 null，这里就跟着返回 null，⛔ 不拿 720p 的数去顶 1080p
 * （那会把 Seedance 2.0 说便宜 2.25 倍）。这是**估价**不是账单：真正扣多少由服务端
 * 按实际用量算。
 */
export function videoCostEstimate(
  modelId: string | undefined,
  params: NodeV4GenerationParams | undefined,
): number | null {
  const seconds = readDurationSeconds(params)
  const resolution = readResolution(params)
  if (!modelId || seconds === null || resolution === null) return null
  const perSecond = getVideoUnitPricePerSecond(modelId, resolution)
  return perSecond === null ? null : perSecond * seconds
}

/**
 * 画面弹层底部那一行：`1920×1080 · 7s · $0.60`。
 *
 * 三截各自缺了就各自不写，⛔ 不留占位（弹层底下多出一条谁也解释不了的空白，比少
 * 一行更难懂）。整行都算不出来时返回空串，渲染层整行不画。
 */
export function videoFrameReadout(
  modelId: string | undefined,
  params: NodeV4GenerationParams | undefined,
  /**
   * 每组的 `已挂 / 上限`（画板底部读数）。译名由调用方给；上限 `null` 时只写
   * 已挂数，⛔ 不写一个编出来的分母。
   */
  groups: readonly {
    readonly label: string
    readonly current: number
    readonly limit: number | null
  }[] = [],
): string {
  const resolution = readResolution(params)
  const ratio = parseAspectRatio(params?.aspectRatio)
  const shortEdge = resolution ? RESOLUTION_SHORT_EDGE[resolution] : null
  const dimension =
    shortEdge && ratio
      ? // 短边固定在档位上，长边按比例推 —— 与上游「按 resolution + ratio 出片」
        // 的口径一致。
        ratio[0] >= ratio[1]
        ? `${Math.round((shortEdge * ratio[0]) / ratio[1])}×${shortEdge}`
        : `${shortEdge}×${Math.round((shortEdge * ratio[1]) / ratio[0])}`
      : null
  const seconds = readDurationSeconds(params)
  const estimate = videoCostEstimate(modelId, params)
  return [
    dimension,
    seconds === null ? null : formatVideoSeconds(seconds),
    estimate === null ? null : formatUnitPriceAmount(estimate),
    ...groups.map((group) =>
      group.limit === null
        ? `${group.label} ${group.current}`
        : `${group.label} ${group.current}/${group.limit}`,
    ),
  ]
    .filter(Boolean)
    .join(' · ')
}
