'use client'

/**
 * 镜头表卡的 RF 节点（H1）：位置读 `state.shotlist.board`，RF 自己那几样（量出的尺寸、选中、
 * 拖动中的位置）记在这里。
 *
 * 为什么不进图引擎的 `rfNodes`：那一份是 `state.nodes` 的投影，而表 ⛔ 不是一张卡（项目级、
 * 不进 op 的节点词表）。所以画布把 RF 的节点变更按 id 分两路：表的进这里，其余照旧进引擎。
 *
 * - 拖动中只改本地位置；松手由画布调 `graph.moveShotTable` 落坐标（拖动坐标例外，不进撤销栈），
 *   再 `endDrag()` 放掉本地位置 —— 之后又读 board。
 * - `remove` 变更在这里忽略：删表走 `onNodesDelete` → `set_shotlist`（一步撤销）。
 */

import { useCallback, useMemo, useState } from 'react'
import {
  applyNodeChanges,
  type Node,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'

import { SHOT_TABLE_BOARD } from '@/constants/shot-spec'

interface ShotTableRfLocal {
  readonly selected: boolean
  readonly dragging: boolean
  readonly measured?: Node['measured']
  /** 拖动中（含刚松手、坐标还没落进 board 的那一下）的位置。 */
  readonly dragPosition?: XYPosition
}

const INITIAL: ShotTableRfLocal = { selected: false, dragging: false }

function compose(
  board: XYPosition,
  local: ShotTableRfLocal,
): Node<Record<string, never>> {
  return {
    id: SHOT_TABLE_BOARD.nodeId,
    type: SHOT_TABLE_BOARD.rfType,
    position: local.dragPosition ?? { x: board.x, y: board.y },
    data: {},
    selected: local.selected,
    dragging: local.dragging,
    ...(local.measured ? { measured: local.measured } : {}),
  }
}

export interface ShotTableRfNode {
  /** 表不在画布上 = `null`。 */
  readonly node: Node<Record<string, never>> | null
  applyChanges(changes: readonly NodeChange[]): void
  endDrag(): void
}

export function useShotTableRfNode(
  board: XYPosition | undefined,
): ShotTableRfNode {
  const [local, setLocal] = useState<ShotTableRfLocal>(INITIAL)

  const node = useMemo(
    () => (board ? compose(board, local) : null),
    [board, local],
  )

  const applyChanges = useCallback(
    (changes: readonly NodeChange[]) => {
      if (!board) return
      const relevant = changes.filter((change) => change.type !== 'remove')
      if (relevant.length === 0) return
      setLocal((prev) => {
        const [next] = applyNodeChanges(
          relevant as NodeChange<Node<Record<string, never>>>[],
          [compose(board, prev)],
        )
        if (!next) return prev
        const moved = relevant.some(
          (change) => change.type === 'position' && change.position,
        )
        return {
          selected: next.selected === true,
          dragging: next.dragging === true,
          ...(next.measured ? { measured: next.measured } : {}),
          ...(moved
            ? { dragPosition: next.position }
            : prev.dragPosition
              ? { dragPosition: prev.dragPosition }
              : {}),
        }
      })
    },
    [board],
  )

  const endDrag = useCallback(() => {
    setLocal((prev) => {
      if (!prev.dragPosition && !prev.dragging) return prev
      return {
        selected: prev.selected,
        dragging: false,
        ...(prev.measured ? { measured: prev.measured } : {}),
      }
    })
  }, [])

  return { node, applyChanges, endDrag }
}
