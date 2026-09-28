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

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { readSlotSources } from '@/lib/node-slot-payload'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

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

/* ═════════════════════════════════════════════════════════════════════════
 * 轨变了，正文里的号跟着走（owner 2026-09-28）
 * ═══════════════════════════════════════════════════════════════════════ */

const RAIL_PREFIX_GROUP = new Map<string, VideoRailGroupId>(
  VIDEO_RAIL_GROUPS.flatMap((group) =>
    VIDEO_RAIL_MENTION_PREFIXES[group].map(
      (prefix) => [prefix.toLowerCase(), group] as const,
    ),
  ),
)

/**
 * `@图2`：前缀 + 序号，序号后面不能紧跟数字（`@图12` 不是 `@图1`）。尾随的一个
 * 空格一并捕获 —— 删掉一项时连它一起删，⛔ 不在正文里留两个空格。
 */
const RAIL_MENTION_PATTERN = new RegExp(
  `@(${[...RAIL_PREFIX_GROUP.keys()].join('|')})(\\d+)(?!\\d)( ?)`,
  'giu',
)

/** 认人的键：组 + 源节点；同一张在组里出现两次，按出现次序各算一个。 */
function railIdentityKeys(
  entries: readonly VideoRailEntry[],
): Map<string, string> {
  const seen = new Map<string, number>()
  const keys = new Map<string, string>()
  for (const entry of entries) {
    const base = `${entry.group}:${entry.sourceNodeId}`
    const occurrence = (seen.get(base) ?? 0) + 1
    seen.set(base, occurrence)
    keys.set(`${entry.group}:${entry.index}`, `${base}#${occurrence}`)
  }
  return keys
}

/**
 * 轨变了之后，把正文里的 `@图N` / `@视频N` / `@语音N` 按「**是哪一张**」对回去。
 *
 * 为什么要有它：序号由 `readVideoRail` 现发，删一项后面顺位、把一张图设成首帧整组
 * 后移 —— 正文不跟着改，`@图2` 就悄悄指到了另一张图，发出去的也跟着错。
 *
 * - 认人按「组 + 源节点」，⛔ 不按序号；前缀原样保留（打的是 `@image2` 就还写 image）。
 * - 这一项被拿掉了：它的 `@` 连同尾随空格一起删（与 `removeMentionsForSource` 同一
 *   条理由：留着就会指向别人）。
 * - 轨上本来就没有的号（`@图9` 而轨上只有 3 张）原样不动 —— 那不是这一次改动造成的。
 */
export function remapVideoRailMentions(
  text: string,
  before: readonly VideoRailEntry[],
  after: readonly VideoRailEntry[],
): string {
  if (!text.includes('@')) return text
  const beforeKeys = railIdentityKeys(before)
  const afterIndexByKey = new Map<string, number>()
  for (const [slotKey, identity] of railIdentityKeys(after)) {
    afterIndexByKey.set(identity, Number(slotKey.split(':')[1]))
  }
  let changed = false
  const next = text.replace(
    RAIL_MENTION_PATTERN,
    (match, prefix: string, digits: string, space: string) => {
      const group = RAIL_PREFIX_GROUP.get(prefix.toLowerCase())
      const identity = group
        ? beforeKeys.get(`${group}:${Number(digits)}`)
        : undefined
      if (!identity) return match
      const index = afterIndexByKey.get(identity)
      if (index === undefined) {
        changed = true
        return ''
      }
      if (index === Number(digits)) return match
      changed = true
      return `@${prefix}${index}${space}`
    },
  )
  return changed ? next : text
}

/** 两份轨是不是同一批东西按同一个顺序挂着（只看「是哪一张」，不看缩略图）。 */
export function sameVideoRailOrder(
  a: readonly VideoRailEntry[],
  b: readonly VideoRailEntry[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.group === b[index]?.group &&
        entry.sourceNodeId === b[index]?.sourceNodeId,
    )
  )
}

/**
 * 一次提交前后，哪些卡的轨变了、正文里的号要改 —— 返回补在**同一个撤销条目**里的
 * `set_prompt`。**纯函数**（图引擎 `dispatch` / `dispatchBatch` / 删节点三条提交口
 * 共用）。
 *
 * ⚠ 这一批里已经改过这张卡正文的，**不动**：那段正文是按新轨写的（助手先连线再写
 *   提示词；`disconnect` 删 chip 时自己已经顺手对过号），再对一遍会把对的改错。
 * ⚠ 只看图 / 视频卡：文本卡没有轨，音频卡的入口不是轨。
 */
export function planRailMentionRemaps(
  before: NodeWorkflowStateV4,
  after: NodeWorkflowStateV4,
): NodeAssistantOpV4[] {
  const ops: NodeAssistantOpV4[] = []
  for (const node of after.nodes) {
    const data = node.data
    if (
      data.kind !== NODE_MEDIA_KIND_IDS.video &&
      data.kind !== NODE_MEDIA_KIND_IDS.image
    ) {
      continue
    }
    const prompt = data.prompt ?? ''
    if (!prompt.includes('@')) continue
    const previous = before.nodes.find((item) => item.id === node.id)
    if (
      !previous ||
      previous.data.kind === NODE_MEDIA_KIND_IDS.text ||
      (previous.data.prompt ?? '') !== prompt
    ) {
      continue
    }
    const railBefore = readVideoRail(previous, before.edges, before.nodes)
    const railAfter = readVideoRail(node, after.edges, after.nodes)
    if (sameVideoRailOrder(railBefore, railAfter)) continue
    const remapped = remapVideoRailMentions(prompt, railBefore, railAfter)
    if (remapped === prompt) continue
    ops.push({
      op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
      target: node.id,
      prompt: remapped.trim().length > 0 ? remapped : ' ',
      mode: 'replace',
    })
  }
  return ops
}

/**
 * 提示词栏那份**还没发出去**的草稿，在「已保存正文变了 / 参考轨变了」之后该是什么
 * （视频卡 `use-video-composer` 与图片卡 `ImageNodeV4` 共用，渲染期同步调它）。
 *
 * - 已保存正文变了、且**不是**这次轨变带来的对号（助手写词等）：草稿整段跟上（原行为）。
 * - 已保存正文的变化**正好就是**图引擎那次对号：⛔ 不整段盖掉用户正在打的字，
 *   只给草稿按同一张轨对号。
 * - 只有轨变了：草稿对号。
 * `syncedRail === null` = 第一次同步，没有「之前的轨」可对。
 */
export function nextPromptDraft(input: {
  readonly draft: string
  readonly syncedPrompt: string
  readonly currentPrompt: string
  readonly syncedRail: readonly VideoRailEntry[] | null
  readonly rail: readonly VideoRailEntry[]
}): string {
  const { draft, syncedPrompt, currentPrompt, syncedRail, rail } = input
  const previousRail =
    syncedRail !== null && !sameVideoRailOrder(syncedRail, rail)
      ? syncedRail
      : null
  if (
    syncedPrompt !== currentPrompt &&
    (previousRail === null ||
      remapVideoRailMentions(syncedPrompt, previousRail, rail) !==
        currentPrompt)
  ) {
    return currentPrompt
  }
  return previousRail
    ? remapVideoRailMentions(draft, previousRail, rail)
    : draft
}
