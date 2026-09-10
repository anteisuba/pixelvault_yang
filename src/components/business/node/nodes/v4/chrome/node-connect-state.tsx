'use client'

/**
 * 画布上「正有一条线（或一张卡）在找落点」的那一刻（spec §1.13，画板
 * `ConnectLines.dc.html` 方向 A）。
 *
 * ── 为什么是 context 而不是每张卡自己算 ────────────────────────────────
 * 合法目标集合要**整张图**才算得出来（`listLiveConnectableSlots` 要边表与节点
 * 表），而拖线的起点只有画布知道。让每张卡在每一帧自己算一遍，等于把一次拖线变成
 * 「卡数 × 帧数」次矩阵查询。所以画布在 `onConnectStart` / `onNodeDragStart` **算
 * 一次**，把结果放这里；卡片只读自己那一位。
 *
 * ⚠ 缺 provider 时返回**静止态**而不是抛错（`useNodeV4Canvas` 那条相反的纪律不
 * 适用）：这一份是纯装饰——发光与压暗。读不到它的后果是「没有拖线反馈」，不是
 * 「静默显示成什么都没连」。
 */

import { createContext, useContext, type ReactNode } from 'react'

export interface NodeConnectState {
  /** 画布上正有一条线 / 一张卡在找落点。 */
  readonly active: boolean
  /** 拖线的起点节点（整卡拖放时是被拖的那张卡）。 */
  readonly sourceId: string | null
  /** 现在收得下这个源的目标节点。⛔ 不含源自己。 */
  readonly legalTargetIds: ReadonlySet<string>
}

const IDLE: NodeConnectState = {
  active: false,
  sourceId: null,
  legalTargetIds: new Set<string>(),
}

const NodeConnectStateContext = createContext<NodeConnectState>(IDLE)

export function NodeConnectStateProvider({
  value,
  children,
}: {
  readonly value: NodeConnectState
  readonly children: ReactNode
}) {
  return (
    <NodeConnectStateContext.Provider value={value}>
      {children}
    </NodeConnectStateContext.Provider>
  )
}

export function useNodeConnectState(): NodeConnectState {
  return useContext(NodeConnectStateContext)
}

export interface NodeConnectRole {
  /** 画布上正在拖，且这张卡不是起点 —— 要么发光要么压暗。 */
  readonly connecting: boolean
  /** 这张卡就是拖线的起点（出口那颗变成 18px 黑底「＋」）。 */
  readonly isSource: boolean
  /** 这张卡收得下（发光）；`connecting` 且非法 = 压暗。 */
  readonly legal: boolean
}

export function useNodeConnectRole(nodeId: string | null): NodeConnectRole {
  const state = useNodeConnectState()
  const isSource = Boolean(nodeId) && state.sourceId === nodeId
  return {
    connecting: state.active && Boolean(nodeId) && !isSource,
    isSource: state.active && isSource,
    legal: Boolean(nodeId) && state.legalTargetIds.has(nodeId as string),
  }
}

export const NODE_CONNECT_STATE_IDLE = IDLE
