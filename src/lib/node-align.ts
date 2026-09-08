/**
 * 多选节点的**对齐**与**等距**（C3 参考 8e-3 的星流快捷键：alt+a/d/w/s 对齐、
 * shift+h/v 等距）。
 *
 * ⚠ 纯函数、进出都是坐标 —— 画布层只负责把「当前选中的这几张卡 + 它们量到的
 * 宽高」递进来，再把结果交给 `graph.moveNodes`（一次提交 = 撤销栈里一条）。
 * ⛔ 不在这里碰 ReactFlow，也⛔ 不读 DOM：那样就没法用 vitest 证明。
 */

export interface AlignBox {
  readonly id: string
  readonly x: number
  readonly y: number
  /** 量到的宽高。没量到时传 0 —— 右/下对齐会退化成按左/上对齐。 */
  readonly width: number
  readonly height: number
}

export interface AlignMove {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
}

export const NODE_ALIGN_EDGE_IDS = {
  left: 'left',
  right: 'right',
  top: 'top',
  bottom: 'bottom',
} as const

export type NodeAlignEdge =
  (typeof NODE_ALIGN_EDGE_IDS)[keyof typeof NODE_ALIGN_EDGE_IDS]

export const NODE_DISTRIBUTE_AXIS_IDS = {
  horizontal: 'horizontal',
  vertical: 'vertical',
} as const

export type NodeDistributeAxis =
  (typeof NODE_DISTRIBUTE_AXIS_IDS)[keyof typeof NODE_DISTRIBUTE_AXIS_IDS]

/** 对齐至少要两张卡才有意义 —— 一张卡对齐自己是空操作。 */
const MIN_ALIGN_COUNT = 2
/** 等距至少要三张：两张之间没有「间距差」可言。 */
const MIN_DISTRIBUTE_COUNT = 3

/**
 * 把选中的卡对齐到某条边。基准是**当前选区那条边的极值**（左对齐取最小 x，
 * 右对齐取最大右缘），⛔ 不引入「主导节点」概念：那需要一个用户看不见的
 * 「先选中的那个」状态。
 */
export function alignNodes(
  boxes: readonly AlignBox[],
  edge: NodeAlignEdge,
): AlignMove[] {
  if (boxes.length < MIN_ALIGN_COUNT) return []

  if (edge === NODE_ALIGN_EDGE_IDS.left) {
    const target = Math.min(...boxes.map((box) => box.x))
    return boxes
      .filter((box) => box.x !== target)
      .map((box) => ({ id: box.id, position: { x: target, y: box.y } }))
  }
  if (edge === NODE_ALIGN_EDGE_IDS.right) {
    const target = Math.max(...boxes.map((box) => box.x + box.width))
    return boxes
      .map((box) => ({
        id: box.id,
        position: { x: target - box.width, y: box.y },
      }))
      .filter((move, index) => move.position.x !== boxes[index]!.x)
  }
  if (edge === NODE_ALIGN_EDGE_IDS.top) {
    const target = Math.min(...boxes.map((box) => box.y))
    return boxes
      .filter((box) => box.y !== target)
      .map((box) => ({ id: box.id, position: { x: box.x, y: target } }))
  }
  const target = Math.max(...boxes.map((box) => box.y + box.height))
  return boxes
    .map((box) => ({
      id: box.id,
      position: { x: box.x, y: target - box.height },
    }))
    .filter((move, index) => move.position.y !== boxes[index]!.y)
}

/**
 * 等距：两端不动，中间的卡按**间隙相等**重排（不是按中心等距——卡宽不一时那会
 * 让窄卡之间看起来更挤）。
 */
export function distributeNodes(
  boxes: readonly AlignBox[],
  axis: NodeDistributeAxis,
): AlignMove[] {
  if (boxes.length < MIN_DISTRIBUTE_COUNT) return []
  const horizontal = axis === NODE_DISTRIBUTE_AXIS_IDS.horizontal
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const start = horizontal ? first.x : first.y
  const end = horizontal ? last.x + last.width : last.y + last.height
  const totalSize = sorted.reduce(
    (sum, box) => sum + (horizontal ? box.width : box.height),
    0,
  )
  // 卡本身已经把跨度占满（甚至溢出）—— 间隙无处可分，什么都不动比负间距好。
  const gap = (end - start - totalSize) / (sorted.length - 1)
  if (!Number.isFinite(gap) || gap < 0) return []

  const moves: AlignMove[] = []
  let cursor = start
  for (const box of sorted) {
    const next = Math.round(cursor)
    if (horizontal) {
      if (next !== box.x) {
        moves.push({ id: box.id, position: { x: next, y: box.y } })
      }
      cursor += box.width + gap
    } else {
      if (next !== box.y) {
        moves.push({ id: box.id, position: { x: box.x, y: next } })
      }
      cursor += box.height + gap
    }
  }
  return moves
}
