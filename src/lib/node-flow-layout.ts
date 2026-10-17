/**
 * 「整理」= 分区排（node-canvas-v2 §7 摆放 A，owner 2026-10-17）：上面是**流程区**，
 * 有连线的卡按链分开，一条链一行带，素材（图 · 角色 · 声音）→ 镜头 → 成片；下面是
 * **素材区**，没连线的卡按类型分成 文本 · 图片 · 视频 · 声音 几块，每块横着铺、满一行
 * 换行。九宫格切出来的一组当一整块挪，组内 3×3 原样。
 *
 * ── 一条链里一张卡落在哪一列 ─────────────────────────────────────────
 * 列 = 「这类卡的档位」与「它上游最右那张的列 + 1」取大。档位是底线（素材 0 · 镜头图
 * 1 · 视频镜头 2）；连线把下游往右推，所以图连到图、镜头连到镜头照样一列往右一列。
 * 空列收掉，⛔ 不留一道空白。
 *
 * ── 链里上下怎么排 ────────────────────────────────────────────────────
 * 从最右一列往左排：最右一列按原来的上下次序叠；往左每张卡对齐它下游里最高那张的
 * 顶边（「素材对齐镜头」），同一个高度被占了就往下挪。整块以原来最左上角那张卡为
 * 原点，⛔ 不把画布挪到别处去。
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

/** 往外再试几列：紧挨着那一列一直往下都满了，就到外面一列去找，取离锚点最近的空位。 */
const NEW_CARD_SEARCH_COLUMNS = 6

/**
 * 新卡这一行落在哪：锚点那一侧一列一列往外试（每列从锚点的高度往下找第一个空位），
 * 取离锚点最近的那个（v3 回放 T03：密的画布上紧挨着那一列一直满到四千多像素以下）。
 */
function nearestFreeRow(
  occupied: readonly FlowLayoutRect[],
  anchor: FlowLayoutRect,
  sizes: readonly FlowLayoutSize[],
  side: 'left' | 'right',
): { readonly x: number; readonly y: number }[] {
  const gap = NODE_V4_CARD.derivedGap
  const rowWidth =
    sizes.reduce((sum, size) => sum + size.width, 0) + gap * (sizes.length - 1)
  let best: { x: number; y: number }[] = []
  let bestDistance = Infinity
  for (let column = 0; column < NEW_CARD_SEARCH_COLUMNS; column += 1) {
    const shift = column * (rowWidth + gap)
    const shifted: FlowLayoutRect = {
      ...anchor,
      x: side === 'right' ? anchor.x + shift : anchor.x - shift,
    }
    const row = placeRowBeside(occupied, shifted, sizes, gap, side)
    const first = row[0]
    if (!first) return row
    const distance = Math.abs(first.x - anchor.x) + Math.abs(first.y - anchor.y)
    if (distance < bestDistance) {
      best = row
      bestDistance = distance
    }
  }
  return best
}

/**
 * **新卡落位**：一批里新建、没给坐标的散卡（助手 `add_node`）。跟已有卡连着的落在那张
 * 卡旁边 —— 喂进它的放左边、从它接出来的放右边；没连线的在散卡区找第一行空位。落在
 * 同一处的几张排成一行，整行一起找空位（v3 回放 T18：按格子排压在已有卡上）。
 *
 * 纯函数：`sizeOf` 给 ReactFlow 量到的尺寸，量不到按收起态估。
 */
export function placeNewCards(
  state: NodeWorkflowStateV4,
  createdIds: readonly string[],
  sizeOf: (node: NodeV4) => FlowLayoutSize | undefined = () => undefined,
): NodeWorkflowStateV4 {
  if (createdIds.length === 0) return state
  const created = new Set(createdIds)
  const byId = new Map(state.nodes.map((node) => [node.id, node]))
  const rectOf = (node: NodeV4, at = node.position): FlowLayoutRect => ({
    ...at,
    ...(sizeOf(node) ?? estimateCardSize(node)),
  })
  const groups = new Map<
    string,
    { anchor: NodeV4 | null; side: 'left' | 'right'; nodes: NodeV4[] }
  >()
  for (const id of createdIds) {
    const node = byId.get(id)
    if (!node) continue
    const feeds = state.edges.find(
      (edge) => edge.source === id && !created.has(edge.target),
    )
    const fedBy = state.edges.find(
      (edge) => edge.target === id && !created.has(edge.source),
    )
    const anchorId = feeds?.target ?? fedBy?.source ?? null
    const side = feeds ? 'left' : 'right'
    const key = `${anchorId ?? ''}|${side}`
    const group = groups.get(key) ?? {
      anchor: anchorId ? (byId.get(anchorId) ?? null) : null,
      side,
      nodes: [],
    }
    group.nodes.push(node)
    groups.set(key, group)
  }
  const occupied: FlowLayoutRect[] = state.nodes
    .filter((node) => !created.has(node.id))
    .map((node) => rectOf(node))
  const looseStart: FlowLayoutRect = {
    x: NODE_V4_LAYOUT.originX - NODE_V4_CARD.derivedGap,
    y: NODE_V4_LAYOUT.looseAreaY,
    width: 0,
    height: 0,
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const group of groups.values()) {
    const anchorRect = group.anchor ? rectOf(group.anchor) : looseStart
    const sizes = group.nodes.map((node) => rectOf(node))
    const row = nearestFreeRow(
      occupied.filter(
        (rect) =>
          !group.anchor || rect.x !== anchorRect.x || rect.y !== anchorRect.y,
      ),
      anchorRect,
      sizes,
      group.anchor ? group.side : 'right',
    )
    row.forEach((at, index) => {
      const node = group.nodes[index]
      if (!node) return
      positions.set(node.id, at)
      occupied.push(rectOf(node, at))
    })
  }
  return {
    ...state,
    nodes: state.nodes.map((node) => {
      const at = positions.get(node.id)
      return at ? { ...node, position: at } : node
    }),
  }
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

/**
 * 整理时一起挪的一块：一般就是一张卡；九宫格切出来的一组（同 `storyboardCell.groupId`）
 * 是一整块，组里的相对位置原样保留 —— ⛔ 把 3×3 拆成一竖条。
 */
interface FlowUnit {
  readonly id: string
  readonly members: readonly NodeV4[]
  readonly position: { readonly x: number; readonly y: number }
  readonly width: number
  readonly height: number
  readonly rank: number
}

function buildUnits(
  nodes: readonly NodeV4[],
  sizeOf: (node: NodeV4) => FlowLayoutSize,
): FlowUnit[] {
  const grouped = new Map<string, NodeV4[]>()
  for (const node of nodes) {
    const groupId =
      node.data.kind === NODE_MEDIA_KIND_IDS.image
        ? node.data.storyboardCell?.groupId
        : undefined
    const key = groupId ? `grid:${groupId}` : node.id
    grouped.set(key, [...(grouped.get(key) ?? []), node])
  }
  return [...grouped.entries()].map(([id, members]) => {
    const x = Math.min(...members.map((node) => node.position.x))
    const y = Math.min(...members.map((node) => node.position.y))
    const right = Math.max(
      ...members.map((node) => node.position.x + sizeOf(node).width),
    )
    const bottom = Math.max(
      ...members.map((node) => node.position.y + sizeOf(node).height),
    )
    return {
      id,
      members,
      position: { x, y },
      width: right - x,
      height: bottom - y,
      rank: Math.max(...members.map(flowRankOf)),
    }
  })
}

function byCurrentPosition(a: FlowUnit, b: FlowUnit): number {
  return a.position.y - b.position.y || a.position.x - b.position.x
}

/** 素材区的先后：文本 · 图片 · 视频 · 声音。 */
const LOOSE_ZONE_ORDER: readonly string[] = [
  NODE_MEDIA_KIND_IDS.text,
  NODE_MEDIA_KIND_IDS.image,
  NODE_MEDIA_KIND_IDS.video,
  NODE_MEDIA_KIND_IDS.audio,
]

type Placement = Map<string, { x: number; y: number }>

/** 一条链按流向排成列（档位与「上游 + 1」取大），返回占到的最低处。 */
function placeChain(
  chain: readonly FlowUnit[],
  sources: ReadonlyMap<string, readonly string[]>,
  targets: ReadonlyMap<string, readonly string[]>,
  byId: ReadonlyMap<string, FlowUnit>,
  origin: { readonly x: number; readonly y: number },
  placed: Placement,
): number {
  // 成环时（不该有，但 ⛔ 不因为脏数据死循环）按档位。
  const column = new Map<string, number>()
  const visiting = new Set<string>()
  const columnOf = (unit: FlowUnit): number => {
    const known = column.get(unit.id)
    if (known !== undefined) return known
    if (visiting.has(unit.id)) return unit.rank
    visiting.add(unit.id)
    let value = unit.rank
    for (const sourceId of sources.get(unit.id) ?? []) {
      value = Math.max(value, columnOf(byId.get(sourceId)!) + 1)
    }
    visiting.delete(unit.id)
    column.set(unit.id, value)
    return value
  }
  for (const unit of chain) columnOf(unit)

  const used = [...new Set(column.values())].sort((a, b) => a - b)
  const columns = used.map((value) =>
    chain.filter((unit) => column.get(unit.id) === value),
  )
  const columnX: number[] = []
  let cursorX = origin.x
  for (const members of columns) {
    columnX.push(cursorX)
    cursorX +=
      Math.max(...members.map((unit) => unit.width)) +
      NODE_V4_LAYOUT.flowColumnGap
  }

  let bottom = origin.y
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    const anchorOf = (unit: FlowUnit): number | undefined => {
      const ys = (targets.get(unit.id) ?? []).flatMap((id) => {
        const at = placed.get(id)
        return at ? [at.y] : []
      })
      return ys.length > 0 ? Math.min(...ys) : undefined
    }
    const members = columns[index]!.map((unit) => ({
      unit,
      anchor: anchorOf(unit),
    })).sort((a, b) => {
      if (a.anchor !== undefined && b.anchor !== undefined)
        return a.anchor - b.anchor || byCurrentPosition(a.unit, b.unit)
      if (a.anchor !== undefined) return -1
      if (b.anchor !== undefined) return 1
      return byCurrentPosition(a.unit, b.unit)
    })
    let cursorY = origin.y
    for (const { unit, anchor } of members) {
      const y = Math.max(cursorY, anchor ?? cursorY)
      placed.set(unit.id, { x: columnX[index]!, y })
      bottom = Math.max(bottom, y + unit.height)
      cursorY = y + unit.height + NODE_V4_LAYOUT.flowRowGap
    }
  }
  return bottom
}

/** 一个素材区横着铺，铺满 `tidyZoneRowWidth` 换行，返回占到的最低处。 */
function placeZone(
  zone: readonly FlowUnit[],
  origin: { readonly x: number; readonly y: number },
  placed: Placement,
): number {
  const gap = NODE_V4_LAYOUT.flowRowGap
  let cursorX = origin.x
  let rowY = origin.y
  let rowHeight = 0
  for (const unit of [...zone].sort(byCurrentPosition)) {
    if (
      cursorX > origin.x &&
      cursorX + unit.width > origin.x + NODE_V4_LAYOUT.tidyZoneRowWidth
    ) {
      cursorX = origin.x
      rowY += rowHeight + gap
      rowHeight = 0
    }
    placed.set(unit.id, { x: cursorX, y: rowY })
    cursorX += unit.width + gap
    rowHeight = Math.max(rowHeight, unit.height)
  }
  return rowY + rowHeight
}

export function tidyByFlow(
  state: NodeWorkflowStateV4,
  sizeOf: (node: NodeV4) => FlowLayoutSize,
): NodeWorkflowStateV4 {
  const nodes = state.nodes
  if (nodes.length === 0) return state
  const units = buildUnits(nodes, sizeOf)
  const byId = new Map(units.map((unit) => [unit.id, unit] as const))
  const unitOf = new Map<string, string>()
  for (const unit of units)
    for (const node of unit.members) unitOf.set(node.id, unit.id)
  const sources = new Map<string, string[]>()
  const targets = new Map<string, string[]>()
  for (const edge of state.edges) {
    const source = unitOf.get(edge.source)
    const target = unitOf.get(edge.target)
    if (!source || !target || source === target) continue
    sources.set(target, [...(sources.get(target) ?? []), source])
    targets.set(source, [...(targets.get(source) ?? []), target])
  }

  // 连在一起的拆成一条条链（不分方向的连通块），按链里最靠上的那张排先后。
  const chainOf = new Map<string, number>()
  const chains: FlowUnit[][] = []
  for (const unit of [...units].sort(byCurrentPosition)) {
    if (chainOf.has(unit.id)) continue
    if (!sources.has(unit.id) && !targets.has(unit.id)) continue
    const chain: FlowUnit[] = []
    const queue = [unit.id]
    chainOf.set(unit.id, chains.length)
    while (queue.length > 0) {
      const id = queue.pop()!
      chain.push(byId.get(id)!)
      for (const next of [
        ...(sources.get(id) ?? []),
        ...(targets.get(id) ?? []),
      ]) {
        if (chainOf.has(next)) continue
        chainOf.set(next, chains.length)
        queue.push(next)
      }
    }
    chains.push(chain)
  }

  const origin = {
    x: Math.min(...units.map((unit) => unit.position.x)),
    y: Math.min(...units.map((unit) => unit.position.y)),
  }
  const placed: Placement = new Map()
  let cursorY = origin.y
  const nextBlock = (bottom: number) => {
    cursorY = bottom + NODE_V4_LAYOUT.tidyZoneGap
  }
  // 流程区：一条链一行带，链与链上下分开。
  for (const chain of chains) {
    nextBlock(
      placeChain(
        chain,
        sources,
        targets,
        byId,
        { x: origin.x, y: cursorY },
        placed,
      ),
    )
  }
  // 素材区：没连线的按类型分块，每块横着铺。
  const loose = units.filter((unit) => !chainOf.has(unit.id))
  const kinds = [
    ...new Set([
      ...LOOSE_ZONE_ORDER,
      ...loose.map((unit) => unit.members[0]!.data.kind),
    ]),
  ]
  for (const kind of kinds) {
    const zone = loose.filter((unit) => unit.members[0]!.data.kind === kind)
    if (zone.length === 0) continue
    nextBlock(placeZone(zone, { x: origin.x, y: cursorY }, placed))
  }

  let moved = false
  const next = nodes.map((node) => {
    const unit = byId.get(unitOf.get(node.id)!)!
    const at = placed.get(unit.id)!
    const position = {
      x: at.x + node.position.x - unit.position.x,
      y: at.y + node.position.y - unit.position.y,
    }
    if (position.x === node.position.x && position.y === node.position.y)
      return node
    moved = true
    return { ...node, position }
  })
  return moved ? { ...state, nodes: next } : state
}
