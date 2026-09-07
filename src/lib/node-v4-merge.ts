/**
 * `video.merge` 的**九槽阵列 + 逐段裁剪**派生（第三期 · 画布 C3c-②Q ·
 * 盘点 §2 `VideoMergeDetailBody`(394)）。
 *
 * ── 为什么是纯函数 ────────────────────────────────────────────────────
 * 「有几段、每段裁到哪」这件事有**两个来源**：段的存在由 `clip` 槽上的边决定，
 * 裁剪区间由 `mergeSettings.clips` 存着。legacy 版本把两者在组件里当场对齐，
 * 且对齐方式是**按下标**——换一次片段顺序，第 1 段的裁剪就落到了新的第 1 段上。
 * 这里按 **url** 对齐（与 `set_merge_clips` 的载荷同一条纪律），并把对齐逻辑挪出
 * 组件，于是「换序之后裁剪跟着谁」是一条可断言的事实而不是一次目检。
 *
 * ⛔ 这里不判「能不能合并」——那是 `validateV4Slots` 的 `belowMin`（`clip` 槽
 * min=2）。⛔ 也不排版式：九个格子怎么摆是组件的事。
 */

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { buildV4MergeClipUrls } from '@/lib/node-slot-payload'
import type {
  NodeV4,
  NodeV4VideoData,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

/** 九槽阵列的格子数 —— 与端口表 `clip.max`、schema `.max(9)` 是同一个 9。 */
export const V4_MERGE_SLOT_COUNT = 9

/** 前两格标「必须」——与端口表 `clip.min` 同源。 */
export const V4_MERGE_REQUIRED_COUNT = 2

export interface V4MergeSlot {
  /** 0 起的格子序号。 */
  readonly index: number
  /** 这一格接了谁；空格是 `undefined`。 */
  readonly url?: string
  /** 前 `V4_MERGE_REQUIRED_COUNT` 格是必填。 */
  readonly required: boolean
  readonly startSec?: number
  readonly endSec?: number
  /** `start >= end` —— 落下去合出来是零帧，所以在 UI 上就要说。 */
  readonly invalidRange: boolean
}

export interface V4MergePlan {
  readonly slots: readonly V4MergeSlot[]
  /** 真的接了片段的格子数。 */
  readonly clipCount: number
  /** 有裁剪区间的段数（「已裁 N 段」那个读数）。 */
  readonly trimmedCount: number
  /** 任何一段区间非法 = 整个合并不该按下去。 */
  readonly hasInvalidRange: boolean
}

function isInvalidRange(start?: number, end?: number): boolean {
  return start !== undefined && end !== undefined && start >= end
}

/**
 * 把「槽上的边」与「存着的裁剪」对齐成九个格子。
 *
 * ⚠ 裁剪**按 url 认领**，不按下标 —— 见文件头。同一段素材接了两次时第一格先领，
 * 这与 `buildV4MergeClipUrls` 的去重是同一条：一个 url 在载荷里只出现一次。
 */
export function buildV4MergePlan(params: {
  readonly nodeId: string
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
}): V4MergePlan {
  const urls = buildV4MergeClipUrls(params)
  const node = params.nodes.find((item) => item.id === params.nodeId)
  const data = node?.data as NodeV4VideoData | undefined
  const stored =
    data && data.kind === 'video' ? (data.mergeSettings?.clips ?? []) : []
  const trimByUrl = new Map(stored.map((clip) => [clip.url, clip]))

  const slots: V4MergeSlot[] = []
  for (let index = 0; index < V4_MERGE_SLOT_COUNT; index += 1) {
    const url = urls[index]
    const trim = url ? trimByUrl.get(url) : undefined
    slots.push({
      index,
      ...(url ? { url } : {}),
      required: index < V4_MERGE_REQUIRED_COUNT,
      ...(trim?.startSec === undefined ? {} : { startSec: trim.startSec }),
      ...(trim?.endSec === undefined ? {} : { endSec: trim.endSec }),
      invalidRange: isInvalidRange(trim?.startSec, trim?.endSec),
    })
  }

  return {
    slots,
    clipCount: urls.length,
    trimmedCount: slots.filter(
      (slot) => slot.startSec !== undefined || slot.endSec !== undefined,
    ).length,
    hasInvalidRange: slots.some((slot) => slot.invalidRange),
  }
}

/**
 * 改一段的裁剪 → `set_merge_clips` 的完整 `clips` 载荷。
 *
 * ⚠ op 收的是**整份**而不是一条补丁：合并段是有序数组，「只改第 3 段」在一个
 * 数组字段上表达不了增删，而 patch 语义会让「清空一段的裁剪」和「没提到这一段」
 * 长得一模一样。整份重发的代价是载荷大一点，换来的是撤销一步回到位。
 *
 * 两端都为空的段**不进载荷** —— 没裁过的段不该在存储里留一条空记录。
 */
export function planV4MergeTrimUpdate(
  plan: V4MergePlan,
  index: number,
  patch: { readonly startSec?: number; readonly endSec?: number },
): {
  readonly url: string
  readonly startSec?: number
  readonly endSec?: number
}[] {
  return plan.slots
    .filter((slot): slot is V4MergeSlot & { url: string } => Boolean(slot.url))
    .map((slot) => {
      const next =
        slot.index === index
          ? { startSec: patch.startSec, endSec: patch.endSec }
          : { startSec: slot.startSec, endSec: slot.endSec }
      return {
        url: slot.url,
        ...(next.startSec === undefined ? {} : { startSec: next.startSec }),
        ...(next.endSec === undefined ? {} : { endSec: next.endSec }),
      }
    })
    .filter((clip) => clip.startSec !== undefined || clip.endSec !== undefined)
}

/** 摘要即标签：`3/9 段 · 已裁 2 段`（legacy `SpecSummaryButton` 的那一行）。 */
export function summarizeV4MergePlan(plan: V4MergePlan): {
  readonly clipCount: number
  readonly slotCount: number
  readonly trimmedCount: number
} {
  return {
    clipCount: plan.clipCount,
    slotCount: V4_MERGE_SLOT_COUNT,
    trimmedCount: plan.trimmedCount,
  }
}

/** 合并节点的 `clip` 槽 id —— 组件里不再手写字面量。 */
export const V4_MERGE_SLOT_ID = NODE_SLOT_IDS.clip
