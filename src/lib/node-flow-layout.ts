/**
 * 「整理」= 按流向排成列（node-canvas-v2 §7 摆放 A）：素材（图 · 角色 · 声音）→ 镜头 →
 * 成片，同一镜头的素材对齐它的高度。
 *
 * ── 一张卡落在哪一列 ──────────────────────────────────────────────────
 * 列 = 「这类卡的档位」与「它上游最右那张的列 + 1」取大。档位是底线（素材 0 · 镜头图
 * 1 · 视频镜头 2）：没连线的视频镜头也站在成片那一列；连线把下游往右推，所以图连到
 * 图、镜头连到镜头照样一列往右一列。空列收掉，⛔ 不留一道空白。
 *
 * ── 上下怎么排 ────────────────────────────────────────────────────────
 * 从最右一列往左排：最右一列按原来的上下次序叠；往左每张卡对齐它下游里最高那张的
 * 顶边（「素材对齐镜头」），同一个高度被占了就往下挪；没有下游的排在这一列最后，
 * 仍按原来的上下次序。整块以原来最左上角那张卡为原点，⛔ 不把画布挪到别处去。
 *
 * ⛔ 纯函数：只动位置 —— 不改连线、不改 `shotNo`、不碰名字（与 §11.3「整理只动位置」
 * 同一条）；卡的尺寸由调用方量好传进来。
 */

import { NODE_V4_CARD, NODE_V4_LAYOUT } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

export interface FlowLayoutSize {
  readonly width: number
  readonly height: number
}

export interface FlowLayoutRect extends FlowLayoutSize {
  readonly x: number
  readonly y: number
}

/**
 * ReactFlow 还没量到的卡（刚建的、屏幕外的）按收起态估一个尺寸。⚠ 宁大勿小：
 * 估小了新卡会压到它身上。
 */
export function estimateCardSize(node: {
  readonly data: { readonly kind: string; readonly subtype: string }
}): FlowLayoutSize {
  const { kind, subtype } = node.data
  if (kind === NODE_MEDIA_KIND_IDS.text) {
    return {
      width: NODE_V4_CARD.textCollapsedWidth,
      height: NODE_V4_CARD.textCollapsedHeight,
    }
  }
  const width =
    kind === NODE_MEDIA_KIND_IDS.video &&
    subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? NODE_V4_CARD.shotCollapsedWidth
      : NODE_V4_CARD.collapsedWidth
  return { width, height: (width * 9) / 16 }
}

/** 两块之间不到 `gap` 就算碰上（连线要有地方走）。 */
function collides(a: FlowLayoutRect, b: FlowLayoutRect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  )
}

/**
 * **派生卡落位**（§7 摆放 A「让位」）：续拍 / 抽帧 / 转文字 / 拆出版本 / 编辑结果这类
 * 从一张卡长出来的新卡，落在来源右边（参考图落左边）第一个空位；那一格被占了就往下
 * 找，⛔ 叠在别的卡上。一次落好几张（续拍的末帧 + 下一镜、编辑出的几张）排成一行，
 * 整行一起找空位。
 *
 * 纯函数：`occupied` 是图上其它卡的占位（不含来源），尺寸由调用方量好。
 */
export function placeRowBeside(
  occupied: readonly FlowLayoutRect[],
  anchor: FlowLayoutRect,
  sizes: readonly FlowLayoutSize[],
  gap: number,
  side: 'right' | 'left' = 'right',
): { readonly x: number; readonly y: number }[] {
  if (sizes.length === 0) return []
  const rowWidth =
    sizes.reduce((sum, size) => sum + size.width, 0) + gap * (sizes.length - 1)
  const rowHeight = Math.max(...sizes.map((size) => size.height))
  const x =
    side === 'right' ? anchor.x + anchor.width + gap : anchor.x - gap - rowWidth
  let y = anchor.y
  // 每挪一次都越过至少一张卡，最多挪 `occupied.length` 次。
  for (let step = 0; step <= occupied.length; step += 1) {
    const row = { x, y, width: rowWidth, height: rowHeight }
    const hits = occupied.filter((rect) => collides(rect, row, gap))
    if (hits.length === 0) break
    y = Math.max(...hits.map((rect) => rect.y + rect.height)) + gap
  }
  let cursor = x
  return sizes.map((size) => {
    const at = { x: cursor, y }
    cursor += size.width + gap
    return at
  })
}

/** 素材 0 · 镜头图 1 · 视频镜头 2。 */
function flowRankOf(node: NodeV4): number {
  const { kind, subtype } = node.data
  if (kind === NODE_MEDIA_KIND_IDS.text || kind === NODE_MEDIA_KIND_IDS.audio)
    return 0
  if (kind === NODE_MEDIA_KIND_IDS.image) {
    return subtype === NODE_V4_IMAGE_SUBTYPE_IDS.shot ||
      subtype === NODE_V4_IMAGE_SUBTYPE_IDS.result
      ? 1
      : 0
  }
  return subtype === NODE_V4_VIDEO_SUBTYPE_IDS.clip ? 0 : 2
}

function byCurrentPosition(a: NodeV4, b: NodeV4): number {
  return a.position.y - b.position.y || a.position.x - b.position.x
}

export function tidyByFlow(
  state: NodeWorkflowStateV4,
  sizeOf: (node: NodeV4) => FlowLayoutSize,
): NodeWorkflowStateV4 {
  const nodes = state.nodes
  if (nodes.length === 0) return state
  const byId = new Map(nodes.map((node) => [node.id, node] as const))
  const sources = new Map<string, string[]>()
  const targets = new Map<string, string[]>()
  for (const edge of state.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    if (edge.source === edge.target) continue
    sources.set(edge.target, [...(sources.get(edge.target) ?? []), edge.source])
    targets.set(edge.source, [...(targets.get(edge.source) ?? []), edge.target])
  }

  // 列：档位与「上游 + 1」取大。成环时（不该有，但 ⛔ 不因为脏数据死循环）按档位。
  const column = new Map<string, number>()
  const visiting = new Set<string>()
  const columnOf = (node: NodeV4): number => {
    const known = column.get(node.id)
    if (known !== undefined) return known
    if (visiting.has(node.id)) return flowRankOf(node)
    visiting.add(node.id)
    let value = flowRankOf(node)
    for (const sourceId of sources.get(node.id) ?? []) {
      value = Math.max(value, columnOf(byId.get(sourceId)!) + 1)
    }
    visiting.delete(node.id)
    column.set(node.id, value)
    return value
  }
  for (const node of nodes) columnOf(node)

  const used = [...new Set(column.values())].sort((a, b) => a - b)
  const columns = used.map((value) =>
    nodes.filter((node) => column.get(node.id) === value),
  )

  const originX = Math.min(...nodes.map((node) => node.position.x))
  const originY = Math.min(...nodes.map((node) => node.position.y))
  const columnX: number[] = []
  let cursorX = originX
  for (const members of columns) {
    columnX.push(cursorX)
    cursorX +=
      Math.max(...members.map((node) => sizeOf(node).width)) +
      NODE_V4_LAYOUT.flowColumnGap
  }

  const placed = new Map<string, { x: number; y: number }>()
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    const anchorOf = (node: NodeV4): number | undefined => {
      const ys = (targets.get(node.id) ?? []).flatMap((id) => {
        const at = placed.get(id)
        return at ? [at.y] : []
      })
      return ys.length > 0 ? Math.min(...ys) : undefined
    }
    const members = columns[index]!.map((node) => ({
      node,
      anchor: anchorOf(node),
    })).sort((a, b) => {
      if (a.anchor !== undefined && b.anchor !== undefined)
        return a.anchor - b.anchor || byCurrentPosition(a.node, b.node)
      if (a.anchor !== undefined) return -1
      if (b.anchor !== undefined) return 1
      return byCurrentPosition(a.node, b.node)
    })
    let cursorY = originY
    for (const { node, anchor } of members) {
      const y = Math.max(cursorY, anchor ?? cursorY)
      placed.set(node.id, { x: columnX[index]!, y })
      cursorY = y + sizeOf(node).height + NODE_V4_LAYOUT.flowRowGap
    }
  }

  let moved = false
  const next = nodes.map((node) => {
    const at = placed.get(node.id)!
    if (at.x === node.position.x && at.y === node.position.y) return node
    moved = true
    return { ...node, position: at }
  })
  return moved ? { ...state, nodes: next } : state
}
