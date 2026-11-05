/**
 * 视频卡「裁剪」→ 渲染计划（node-canvas-v2 §4 shot 那条：「视频裁剪走剪辑台的渲染层」）。
 *
 * ⚠ ⛔ 不手拼 `RenderPlan`：裁剪 = **只有一段的时间线**，交给剪辑台导出那一个
 * `toRenderPlan`。拼计划只有一处，校验（零长 / 超长 / 缺片）与输出像素换算也只有一处。
 */

import {
  EDIT_ASPECTS,
  EDIT_EXPORT_RANGE_IDS,
  type EditAspect,
  type EditResolution,
} from '@/constants/edit-desk'
import {
  RENDER_ASPECT_RATIO_PARTS,
  RENDER_PLAN_ERROR_CODES,
  RENDER_SHORT_SIDE_BY_RESOLUTION,
  type RenderPlan,
} from '@/constants/render-video'
import {
  buildClipFromNode,
  createEmptyEditProject,
  RenderPlanError,
  toRenderPlan,
} from '@/lib/edit-project'
import type { NodeV4 } from '@/types/node-workflow'

export interface VideoTrimRange {
  readonly startSec: number
  readonly endSec: number
}

const ASPECT_TIE_EPSILON = 1e-6

/**
 * 渲染层只出三种比例（16:9 / 9:16 / 1:1）：取最接近原片的那一种，其余由渲染层加黑边
 * （`scale … decrease` + `pad`），⛔ 不裁画面。量不到宽高 = 横屏。
 */
export function nearestRenderAspect(
  width?: number,
  height?: number,
): EditAspect {
  if (!width || !height || width <= 0 || height <= 0) return EDIT_ASPECTS[0]
  const ratio = width / height
  let best: EditAspect = EDIT_ASPECTS[0]
  let bestGap = Infinity
  for (const aspect of EDIT_ASPECTS) {
    const parts = RENDER_ASPECT_RATIO_PARTS[aspect]
    const target = parts.portrait
      ? parts.short / parts.long
      : parts.long / parts.short
    // 比较对数差：2:1 与 1:2 离 1:1 一样远。⚠ 4:3 恰好是 16:9 与 1:1 的几何中点 ——
    // 平局留在排前面的横 / 竖屏（只有明显更近才换成方的），⛔ 让浮点误差决定。
    const gap = Math.abs(Math.log(ratio / target))
    if (gap < bestGap - ASPECT_TIE_EPSILON) {
      best = aspect
      bestGap = gap
    }
  }
  return best
}

/** 清晰度跟原片短边走：不往上拉（720 的片子出 1080 只是更大的糊），量不到 = 1080p。 */
export function renderResolutionFor(
  width?: number,
  height?: number,
): EditResolution {
  if (!width || !height || width <= 0 || height <= 0) return '1080p'
  const short = Math.min(width, height)
  if (short <= RENDER_SHORT_SIDE_BY_RESOLUTION['720p']) return '720p'
  if (short < RENDER_SHORT_SIDE_BY_RESOLUTION['4k']) return '1080p'
  return '4k'
}

export function buildVideoTrimPlan(
  node: NodeV4,
  range: VideoTrimRange,
  options: {
    readonly projectId: string
    /** 成片名 = 新卡名（「原名 · 裁剪」，i18n 由调用方拼）。 */
    readonly name: string
    /** 原片像素（`<video>` 量到的）。 */
    readonly width?: number
    readonly height?: number
    readonly mintId: (prefix: string) => string
  },
): RenderPlan {
  const clip = buildClipFromNode(node, options.mintId)
  if (!clip) {
    throw new RenderPlanError(
      RENDER_PLAN_ERROR_CODES.missingSource,
      'The card has no playable video.',
    )
  }
  const empty = createEmptyEditProject(options.name)
  const project = {
    ...empty,
    tracks: {
      ...empty.tracks,
      video: [
        {
          ...clip,
          in: Math.max(0, range.startSec),
          out: Math.max(0, range.endSec),
        },
      ],
    },
    settings: {
      aspect: nearestRenderAspect(options.width, options.height),
      resolution: renderResolutionFor(options.width, options.height),
    },
  }
  return toRenderPlan(
    project,
    [node],
    { range: EDIT_EXPORT_RANGE_IDS.all },
    { projectId: options.projectId },
  )
}
