'use client'

/**
 * 镜头表卡在画布上要用的东西（H1，owner 2026-11-06）。
 *
 * 为什么走 context 而不是塞进 RF 节点的 `data`：表不是 `state.nodes` 里的一张卡（项目级一张，
 * 位置在 `state.shotlist.board`），它的 RF 节点是画布每次合成的；把 dispatch / 整份 state
 * 塞进 `data` 会让 RF 每次重渲都当作节点变了。工作台在画布外包这一层，`ShotTableNode` 读。
 */

import { createContext, useContext, type ReactNode } from 'react'

import type { CharacterCardRecord } from '@/types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

import type { ShotReadingState } from '@/features/canvas/hooks/use-shot-reading'

import type { ShotPullSourceActions } from './ShotPullSourcePicker'

/** 读镜（H4b）在表上露出来的那一份：表头下那条 + 卡边进度 + 在读那几行的灰条。 */
export interface ShotTableReadingView {
  readonly state: ShotReadingState
  /** 停下 / 算了：已填的留着。 */
  stop(): void
  /** 从没读出来的那一批接着读；给了 key = 换这把（刚在弹窗里配好的）。 */
  retry(apiKeyId?: string): void
}

export interface ShotTableBoardValue {
  readonly state: NodeWorkflowStateV4
  readonly characterCards: readonly CharacterCardRecord[]
  /** 卡外上方那行「镜头表 · 项目名」里的项目名；没有项目时只写「镜头表」。 */
  readonly projectName?: string
  dispatch(op: NodeAssistantOpV4): boolean
  dispatchBatch(ops: readonly NodeAssistantOpV4[]): unknown
  onAddShot(): void
  onLocate(nodeId: string): void
  /** 拉片（H4a）：拉画布上的某张片段卡 / 先上传 / 先从素材库拿。 */
  readonly pull?: ShotPullSourceActions
  /** 读镜（H4b）：宿主给了才有表头下那条。 */
  readonly reading?: ShotTableReadingView
}

const ShotTableBoardContext = createContext<ShotTableBoardValue | null>(null)

export function ShotTableBoardProvider({
  value,
  children,
}: {
  readonly value: ShotTableBoardValue
  readonly children: ReactNode
}) {
  return (
    <ShotTableBoardContext.Provider value={value}>
      {children}
    </ShotTableBoardContext.Provider>
  )
}

export function useShotTableBoard(): ShotTableBoardValue | null {
  return useContext(ShotTableBoardContext)
}
