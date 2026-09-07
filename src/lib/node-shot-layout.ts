/**
 * 镜头带布局 · 换序 · 整理（node-canvas-v2 §6）。
 *
 * ── 为什么镜头带不是节点 ────────────────────────────────────────────────
 * §1.3 选了「视频节点即镜头 + lane 布局」而不是容器节点：ReactFlow 的子节点坐标
 * 相对父节点，落地 `parentId` 等于把画布上所有绝对坐标逻辑推翻一遍。所以镜头带
 * 是**布局层按 `data.shotNo` 派生的分组**——纯渲染，无 schema、无坐标系变更。
 *
 * ⛔ 一条写死的边界（§6 末条）：**整理只动位置**。绝不顺手改 `shotNo`、绝不删边
 * ——否则用户不敢按它。改 `shotNo` 的只有 `moveNodeToShot` / `reorderShots`，
 * 它们各自把名字里的 `S<nn>` 段一起带走。
 *
 * ⛔ 纯函数：不碰 DOM、不碰 ReactFlow 实例。
 */

import { getNodeV4Ports, type NodeSlotId } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_V4_CARD, NODE_V4_LAYOUT } from '@/constants/node-studio'
import { applyShotNoToNodeName } from '@/lib/node-display-name'
import { resolveCurrentSourceId } from '@/lib/node-slot-binding'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

export interface ShotLane {
  readonly shotNo: number
  /** 这条带在时间轴上的 x 起点。 */
  readonly x: number
  readonly width: number
  /** 带内节点 id，按版式顺序（上行文本，然后下行媒体）。 */
  readonly nodeIds: readonly string[]
  /** 这一镜的 `video.shot` 节点（可能还没建）。 */
  readonly shotNodeId?: string
}

/** 画布上出现过的镜号，升序去重。 */
export function listShotNos(nodes: readonly NodeV4[]): number[] {
  return [
    ...new Set(
      nodes
        .map((node) => node.data.shotNo)
        .filter((shotNo): shotNo is number => typeof shotNo === 'number'),
    ),
  ].sort((a, b) => a - b)
}

/** 新建镜头插在末尾（§6）。 */
export function nextShotNo(nodes: readonly NodeV4[]): number {
  const shots = listShotNos(nodes)
  return (shots[shots.length - 1] ?? 0) + 1
}

function isShotNode(data: NodeV4Data): boolean {
  return data.kind === NODE_MEDIA_KIND_IDS.video && data.subtype === 'shot'
}

function isTextNode(data: NodeV4Data): boolean {
  return data.kind === NODE_MEDIA_KIND_IDS.text
}

/**
 * 带内下行「左边那一摞」的顺序 = **槽的顺序**（§6：两处不许各排各的）。
 * 顺序取自端口表 `inputs` 的数组顺序，不在这里重写一份。
 */
export function orderSourcesBySlot(
  shot: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
): string[] {
  const ports = getNodeV4Ports(shot.data.kind, shot.data.subtype)
  if (!ports) return []
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const spec of ports.inputs) {
    for (const sourceId of sourcesInSlot(shot, spec.slot, edges)) {
      if (seen.has(sourceId)) continue
      seen.add(sourceId)
      ordered.push(sourceId)
    }
  }
  return ordered
}

/** 一个槽当前展示的源节点：轮播槽只报当前版，0..N 槽报全部。 */
function sourcesInSlot(
  node: NodeV4,
  slot: NodeSlotId,
  edges: readonly NodeWorkflowEdgeV4[],
): string[] {
  const binding = node.data.slots?.[slot]
  if (binding) {
    if (binding.versions.length > 0 && binding.cur) {
      const current = resolveCurrentSourceId(node, slot)
      // 轮播槽（cur 指向唯一当前版）只出当前版；0..N 槽的 binding 里每一版都是
      // 并列内容，全部出。
      const all = binding.versions
        .filter((version) => !version.blocked)
        .map((version) => version.sourceNodeId)
      return all.length > 1 ? all : current ? [current] : []
    }
    return []
  }
  return edges
    .filter((edge) => edge.target === node.id && edge.slot === slot)
    .map((edge) => edge.source)
}

/**
 * 按 `shotNo` 把画布切成横排的镜头带。带宽 = `max(带内内容宽, minLaneWidth)`，
 * 带间距 `laneGap`。
 */
export function buildShotLanes(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
): ShotLane[] {
  const lanes: ShotLane[] = []
  let cursorX = NODE_V4_LAYOUT.originX

  for (const shotNo of listShotNos(nodes)) {
    const inLane = nodes.filter((node) => node.data.shotNo === shotNo)
    const shotNode = inLane.find((node) => isShotNode(node.data))
    const texts = inLane.filter((node) => isTextNode(node.data))
    const sources = shotNode
      ? orderSourcesBySlot(shotNode, edges).filter((id) =>
          inLane.some((node) => node.id === id),
        )
      : []
    const rest = inLane.filter(
      (node) =>
        node.id !== shotNode?.id &&
        !texts.some((text) => text.id === node.id) &&
        !sources.includes(node.id),
    )

    const textRowWidth =
      texts.length *
      (NODE_V4_CARD.textCollapsedWidth + NODE_V4_LAYOUT.laneRowGap)
    const mediaRowWidth =
      NODE_V4_CARD.collapsedWidth +
      NODE_V4_LAYOUT.laneRowGap +
      NODE_V4_CARD.shotCollapsedWidth
    const width = Math.max(
      NODE_V4_LAYOUT.minLaneWidth,
      textRowWidth,
      mediaRowWidth,
    )

    lanes.push({
      shotNo,
      x: cursorX,
      width,
      nodeIds: [
        ...texts.map((node) => node.id),
        ...sources,
        ...(shotNode ? [shotNode.id] : []),
        ...rest.map((node) => node.id),
      ],
      ...(shotNode ? { shotNodeId: shotNode.id } : {}),
    })
    cursorX += width + NODE_V4_LAYOUT.laneGap
  }

  return lanes
}

/**
 * 「整理」：把镜头带内的节点重排到标准版式。
 *
 * ⛔ 不动散节点的自由位置、不动带的顺序、**不动任何数据**（`shotNo` / 边 / 名字
 * 一个都不碰）。返回的 state 只有 `position` 变了。
 */
export function tidyShotLanes(state: NodeWorkflowStateV4): NodeWorkflowStateV4 {
  const lanes = buildShotLanes(state.nodes, state.edges)
  const positions = new Map<string, { x: number; y: number }>()

  for (const lane of lanes) {
    const inLane = lane.nodeIds
      .map((id) => state.nodes.find((node) => node.id === id))
      .filter((node): node is NodeV4 => node !== undefined)
    const texts = inLane.filter((node) => isTextNode(node.data))
    const shotNode = inLane.find((node) => isShotNode(node.data))
    const media = inLane.filter(
      (node) => !isTextNode(node.data) && node.id !== shotNode?.id,
    )

    texts.forEach((node, index) => {
      positions.set(node.id, {
        x:
          lane.x +
          index * (NODE_V4_CARD.textCollapsedWidth + NODE_V4_LAYOUT.laneRowGap),
        y: NODE_V4_LAYOUT.textRowY,
      })
    })

    media.forEach((node, index) => {
      positions.set(node.id, {
        x: lane.x,
        y:
          NODE_V4_LAYOUT.mediaRowY +
          index * (NODE_V4_CARD.slotChipSize * 6 + NODE_V4_LAYOUT.nodeRowGap),
      })
    })

    if (shotNode) {
      positions.set(shotNode.id, {
        x: lane.x + NODE_V4_CARD.collapsedWidth + NODE_V4_LAYOUT.laneRowGap,
        y: NODE_V4_LAYOUT.mediaRowY,
      })
    }
  }

  if (positions.size === 0) return state
  return {
    ...state,
    nodes: state.nodes.map((node) => {
      const position = positions.get(node.id)
      return position ? { ...node, position } : node
    }),
  }
}

/** 散节点自由区的落点（时间轴下方，§6）。助手 `add_node` 不带 `shotNo` 时用它。 */
export function looseAreaSpawn(index: number): { x: number; y: number } {
  const column = index % NODE_V4_LAYOUT.looseColumns
  const row = Math.floor(index / NODE_V4_LAYOUT.looseColumns)
  return {
    x: NODE_V4_LAYOUT.originX + column * NODE_V4_LAYOUT.looseColumnGap,
    y: NODE_V4_LAYOUT.looseAreaY + row * NODE_V4_LAYOUT.looseRowGap,
  }
}

/** 一个新镜头节点该落在时间轴哪里（插末尾）。 */
export function shotSpawnPosition(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
  shotNo: number,
): { x: number; y: number } {
  const lanes = buildShotLanes(nodes, edges)
  const lane = lanes.find((item) => item.shotNo === shotNo)
  if (lane) {
    return {
      x: lane.x + NODE_V4_CARD.collapsedWidth + NODE_V4_LAYOUT.laneRowGap,
      y: NODE_V4_LAYOUT.mediaRowY,
    }
  }
  const last = lanes[lanes.length - 1]
  const x = last
    ? last.x + last.width + NODE_V4_LAYOUT.laneGap
    : NODE_V4_LAYOUT.originX
  return {
    x: x + NODE_V4_CARD.collapsedWidth + NODE_V4_LAYOUT.laneRowGap,
    y: NODE_V4_LAYOUT.mediaRowY,
  }
}

function renameForShot(node: NodeV4, shotNo: number | undefined): NodeV4 {
  const name = applyShotNoToNodeName(node.data.name, shotNo)
  const data = { ...node.data } as NodeV4Data
  data.name = name
  if (shotNo === undefined) delete data.shotNo
  else data.shotNo = shotNo
  return { ...node, data }
}

/** `move_to_shot`：改镜号 + 名字里的 `S<nn>` 段跟随（§4.2 末条）。 */
export function moveNodeToShot(
  state: NodeWorkflowStateV4,
  nodeId: string,
  shotNo: number | null,
): NodeWorkflowStateV4 {
  return {
    ...state,
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? renameForShot(node, shotNo ?? undefined) : node,
    ),
  }
}

/**
 * `reorder_shot`：把第 `from` 镜挪到第 `to` 位，其余镜号顺移。
 * 整次换序是**一步**（一次 undo 记录），名字全部跟随重排。
 */
export function reorderShots(
  state: NodeWorkflowStateV4,
  from: number,
  to: number,
): NodeWorkflowStateV4 {
  const shots = listShotNos(state.nodes)
  if (from === to || !shots.includes(from)) return state
  const target = Math.min(
    Math.max(to, shots[0] ?? 1),
    shots[shots.length - 1] ?? 1,
  )

  const reordered = shots.filter((shotNo) => shotNo !== from)
  const insertAt = shots.indexOf(target)
  reordered.splice(insertAt < 0 ? reordered.length : insertAt, 0, from)

  // 旧镜号 → 新镜号。位次决定新号，号本身连续从第一镜的号开始。
  const base = shots[0] ?? 1
  const mapping = new Map<number, number>()
  reordered.forEach((shotNo, index) => mapping.set(shotNo, base + index))

  return {
    ...state,
    nodes: state.nodes.map((node) => {
      const current = node.data.shotNo
      if (current === undefined) return node
      const next = mapping.get(current)
      if (next === undefined || next === current) return node
      return renameForShot(node, next)
    }),
  }
}
