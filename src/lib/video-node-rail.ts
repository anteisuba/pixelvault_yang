/**
 * 视频节点的**参考轨**（v3 spec §5，画板 `VideoRefs.dc.html` 方向 A）——纯读函数。
 *
 * 轨 = 三组：图 · 视频 · 语音。数据一个字段都不新增：
 *   · 图组   = `firstFrame` + `lastFrame` + `reference` 里的图
 *   · 视频组 = `reference` 里的视频
 *   · 语音组 = `voice`
 *
 * **组内序号就是 `@` 里的号**（`@图1` / `@视频1` / `@语音1`），删一项后面顺位 ——
 * 所以序号只能由这一份读函数发，⛔ 组件里不另数一遍（数两遍就会与 @ 对不上）。
 */

import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { readSlotSources } from '@/lib/node-slot-payload'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

export const VIDEO_RAIL_GROUP_IDS = {
  image: 'image',
  video: 'video',
  voice: 'voice',
} as const

export const VIDEO_RAIL_GROUPS = [
  VIDEO_RAIL_GROUP_IDS.image,
  VIDEO_RAIL_GROUP_IDS.video,
  VIDEO_RAIL_GROUP_IDS.voice,
] as const

export type VideoRailGroupId = (typeof VIDEO_RAIL_GROUPS)[number]

export interface VideoRailEntry {
  readonly group: VideoRailGroupId
  /** 组内序号，1 起 —— `@图1` 指的就是它。 */
  readonly index: number
  readonly slot: NodeSlotId
  readonly edgeId: string
  readonly sourceNodeId: string
  readonly sourceName: string
  readonly thumbnailUrl?: string
}

/**
 * `@` 里能打出来的组前缀。**三语全收**（与 `NODE_MENTION_ROLE_LABELS` 同一条
 * 论据：解析靠固定表，⛔ 不靠当前 locale，否则同一段文字在不同界面语言下解析
 * 出不同的槽）。
 */
export const VIDEO_RAIL_MENTION_PREFIXES: Readonly<
  Record<VideoRailGroupId, readonly string[]>
> = {
  [VIDEO_RAIL_GROUP_IDS.image]: ['图', '画像', 'image'],
  [VIDEO_RAIL_GROUP_IDS.video]: ['视频', '動画', 'video'],
  [VIDEO_RAIL_GROUP_IDS.voice]: ['语音', '音声', 'voice'],
}

/** 这一项在正文里能被写成哪些串（`图1` / `画像1` / `image1`）。 */
export function videoRailMentionLabels(entry: VideoRailEntry): string[] {
  return VIDEO_RAIL_MENTION_PREFIXES[entry.group].map(
    (prefix) => `${prefix}${entry.index}`,
  )
}

/**
 * 轨上那 32px 画什么。
 *
 * ⚠ 视频取的是**封面**（`videoThumbnailUrl`），⛔ 不拿成片 url 当图：
 * `<img src={视频}>` 画不出任何东西，只会出一枚碎图标（2026-09-10 真机实测）。
 * 没有封面就不给图，由渲染层画一枚占位字形。语音本来就没有图。
 */
function thumbOf(node: NodeV4): string | undefined {
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return undefined
  if (data.kind === NODE_MEDIA_KIND_IDS.audio) return undefined
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return data.videoThumbnailUrl
  return data.url
}

/**
 * 这张视频卡当前挂了什么 —— 三组按 图 · 视频 · 语音 的顺序摊平。
 *
 * 组内顺序 = 边的顺序（`readSlotSources` 已按槽的版本 / 边表顺序给出），图组里
 * 首帧 → 尾帧 → 参考图，⛔ 不按名字或时间重排：序号要稳定。
 */
export function readVideoRail(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): readonly VideoRailEntry[] {
  const entries: VideoRailEntry[] = []
  const counters: Record<VideoRailGroupId, number> = {
    image: 0,
    video: 0,
    voice: 0,
  }

  const push = (
    group: VideoRailGroupId,
    slot: NodeSlotId,
    source: { readonly edgeId: string; readonly node: NodeV4 },
  ): void => {
    counters[group] += 1
    const url = thumbOf(source.node)
    entries.push({
      group,
      index: counters[group],
      slot,
      edgeId: source.edgeId,
      sourceNodeId: source.node.id,
      sourceName: source.node.data.name,
      ...(url ? { thumbnailUrl: url } : {}),
    })
  }

  for (const slot of [NODE_SLOT_IDS.firstFrame, NODE_SLOT_IDS.lastFrame]) {
    for (const source of readSlotSources(node, slot, edges, nodes)) {
      push(VIDEO_RAIL_GROUP_IDS.image, slot, source)
    }
  }
  // 参考槽图与视频同槽（端口表 `video.shot.reference` 两种 kind 都收），按 kind
  // 分流到两组 —— 槽只回答「它是参考」。
  const references = readSlotSources(
    node,
    NODE_SLOT_IDS.reference,
    edges,
    nodes,
  )
  for (const source of references) {
    if (source.node.data.kind === NODE_MEDIA_KIND_IDS.video) continue
    push(VIDEO_RAIL_GROUP_IDS.image, NODE_SLOT_IDS.reference, source)
  }
  for (const source of references) {
    if (source.node.data.kind !== NODE_MEDIA_KIND_IDS.video) continue
    push(VIDEO_RAIL_GROUP_IDS.video, NODE_SLOT_IDS.reference, source)
  }
  for (const source of readSlotSources(
    node,
    NODE_SLOT_IDS.voice,
    edges,
    nodes,
  )) {
    push(VIDEO_RAIL_GROUP_IDS.voice, NODE_SLOT_IDS.voice, source)
  }

  return entries
}

/** 轨上每组各挂了几项（推模式与底部读数都读它）。 */
export function videoRailCounts(entries: readonly VideoRailEntry[]): {
  readonly image: number
  readonly video: number
  readonly voice: number
  readonly firstFrame: boolean
  readonly lastFrame: boolean
  readonly referenceImages: number
} {
  const of = (group: VideoRailGroupId) =>
    entries.filter((entry) => entry.group === group)
  const images = of(VIDEO_RAIL_GROUP_IDS.image)
  return {
    image: images.length,
    video: of(VIDEO_RAIL_GROUP_IDS.video).length,
    voice: of(VIDEO_RAIL_GROUP_IDS.voice).length,
    firstFrame: images.some((entry) => entry.slot === NODE_SLOT_IDS.firstFrame),
    lastFrame: images.some((entry) => entry.slot === NODE_SLOT_IDS.lastFrame),
    referenceImages: images.filter(
      (entry) => entry.slot === NODE_SLOT_IDS.reference,
    ).length,
  }
}
