'use client'

/**
 * 表坐在画布上时，画布侧要给每张卡的那几样（H2b，owner 2026-11-07，`canvas-shotlist.md` 第 26 条）。
 *
 * - 「N 镜」角标：这张素材卡被几镜用（0 不显示）。
 * - 点着一张素材：它描蓝边、其它素材卡变淡（表那边的行 / 格子由 `ShotTableNode` 读 `focusId`，
 *   用到它的是哪几行由表自己按同一份行数据算）。
 * - 拖着一张素材卡压在表上：表描蓝边 + 浅蓝光晕，卡下面一行「松手 = 加进全片素材」。
 *   压上去的是一段有片子的片段卡（H4a）：提示换成「松手 = 拉片」，松手打开拉片纸。
 *
 * 为什么是 context：数要整张图才算得出来（`buildShotTableRows`），而卡壳只知道自己的 id ——
 * 画布算一次放这里，卡壳只读自己那一位（与 `node-connect-state` 同一条理由）。
 * 缺 provider = 静止态：什么都不画（纯装饰，读不到的后果是「没有角标」）。
 */

import { createContext, useContext, type ReactNode } from 'react'

export interface ShotTableCanvasState {
  /** 素材卡 id → 被几镜用。表不在画布上时为空。 */
  readonly shotCounts: ReadonlyMap<string, number>
  /** 点着的那张素材；`null` = 没点。 */
  readonly focusId: string | null
  /** 点着素材时变淡的其它素材卡。 */
  readonly dimIds: ReadonlySet<string>
  /** 正压在表上、松手就进全片素材的那张卡；`null` = 没有。 */
  readonly dropSourceId: string | null
  /** 压在表上的是能拉片的片段卡（H4a）：松手 = 拉片，不进全片素材。 */
  readonly dropPull: boolean
}

const IDLE: ShotTableCanvasState = {
  shotCounts: new Map(),
  focusId: null,
  dimIds: new Set(),
  dropSourceId: null,
  dropPull: false,
}

const ShotTableCanvasContext = createContext<ShotTableCanvasState>(IDLE)

export function ShotTableCanvasProvider({
  value,
  children,
}: {
  readonly value: ShotTableCanvasState
  readonly children: ReactNode
}) {
  return (
    <ShotTableCanvasContext.Provider value={value}>
      {children}
    </ShotTableCanvasContext.Provider>
  )
}

export function useShotTableCanvas(): ShotTableCanvasState {
  return useContext(ShotTableCanvasContext)
}

export interface ShotTableCanvasCard {
  /** 「N 镜」；0 = 不显示。 */
  readonly shotCount: number
  readonly focused: boolean
  readonly dimmed: boolean
  /** 这张卡正压在表上（卡下面出提示）。`pull` = 松手就拉片（H4a）。 */
  readonly dropping: false | 'film' | 'pull'
}

export function useShotTableCanvasCard(
  nodeId: string | null,
): ShotTableCanvasCard {
  const state = useShotTableCanvas()
  if (!nodeId) {
    return { shotCount: 0, focused: false, dimmed: false, dropping: false }
  }
  return {
    shotCount: state.shotCounts.get(nodeId) ?? 0,
    focused: state.focusId === nodeId,
    dimmed: state.dimIds.has(nodeId),
    dropping:
      state.dropSourceId === nodeId
        ? state.dropPull
          ? 'pull'
          : 'film'
        : false,
  }
}

export const SHOT_TABLE_CANVAS_IDLE = IDLE
