'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from 'react'

import {
  isCanvasAssistantPickIncluded,
  resolveCanvasAssistantPick,
  type CanvasAssistantPickResult,
} from '@/lib/canvas-assistant-pick'
import { findNodeCardElement } from '@/hooks/node/use-cast-ingest'
import type { NodeStudioAssistantPickRejectReason } from '@/constants/node-studio'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'

/** 手势 A arm 态的目标类（CSS 在 canvas.css，紧挨 `.node-quick-throw-target`）：
 *  还能拾的节点亮描边，已经在输入框里的 ⊘ 半透明。命令式 classList，与快投 /
 *  吞噬同一条「不进 React state」纪律 —— 节点组件不为这个模式重渲染。 */
const PICK_TARGET_CLASS = 'node-assistant-pick-target'
const PICK_INCLUDED_CLASS = 'node-assistant-pick-included'

/**
 * 手势 A 的命令式桥（与 `QuickThrowApi` 同形）：dock 把它写进 ref，workbench 的
 * `onNodeClick` / `onPaneClick` / Esc 栈在**事件时**读 —— 那些 handler 的闭包在
 * dock 外面，拿不到 dock 的 state。
 */
export interface CanvasAssistantPickApi {
  /** 输入框正在等画布上的一次点击。 */
  armed: boolean
  arm(): void
  /** 把 `nodeId` 送进输入框；判定结果回给调用方（拒绝时它决定要不要保留选中）。 */
  feed(nodeId: string): CanvasAssistantPickResult
  exit(): void
}

export interface UseCanvasAssistantPickOptions {
  nodes: readonly NodeWorkflowNode[]
  getNodeTypeLabel(type: NodeWorkflowNode['type']): string
  /** 输入框里已挂的媒体引用 —— 由 dock 持有（手势 A 把它从会话组件提上来了）。 */
  selectedReferences: readonly NodeAssistantMediaReference[]
  onAddReference(reference: NodeAssistantMediaReference): void
  apiRef?: MutableRefObject<CanvasAssistantPickApi | null>
  /** 一次成功拾取之后（dock 用它把焦点送回输入框）。 */
  onPicked?(result: CanvasAssistantPickResult): void
  /** 被拒的拾取（上限 / 重复）—— dock 用它大声说出来，hook 自己不认识 toast。 */
  onRejected?(reason: NodeStudioAssistantPickRejectReason): void
}

export interface UseCanvasAssistantPickValue {
  armed: boolean
  arm(): void
  exit(): void
  toggle(): void
  feed(nodeId: string): CanvasAssistantPickResult
  /** 拾进输入框的**非媒体**节点 id（媒体节点走 `selectedReferences`）。 */
  pickedNodeIds: string[]
  unpickNode(nodeId: string): void
  clearPicks(): void
}

/**
 * 手势 A · 「点输入框，再点画布节点，节点进输入框」。
 *
 * arm 规则（本 hook 只提供 arm / exit，**谁来调**在 dock）：输入框聚焦即 arm，
 * composer 里的「从画布选」按钮显式切换。退出：Esc / 点空白画布 / 发送 / 再点一次
 * 按钮。⛔ **不在失焦时退出** —— 点节点本身就会让输入框失焦，失焦退出等于手势
 * 永远触发不了。
 */
export function useCanvasAssistantPick({
  nodes,
  getNodeTypeLabel,
  selectedReferences,
  onAddReference,
  apiRef,
  onPicked,
  onRejected,
}: UseCanvasAssistantPickOptions): UseCanvasAssistantPickValue {
  const [armed, setArmed] = useState(false)
  const [rawPickedNodeIds, setPickedNodeIds] = useState<string[]>([])
  // 节点被删掉时它自动从列表里消失 —— 派生而不是在 effect 里 setState：否则
  // `[[node:id]]` 会指向一个不存在的节点，服务端渲染成裸 id。
  const pickedNodeIds = useMemo(
    () => rawPickedNodeIds.filter((id) => nodes.some((node) => node.id === id)),
    [nodes, rawPickedNodeIds],
  )

  const arm = useCallback(() => setArmed(true), [])
  const exit = useCallback(() => setArmed(false), [])
  const toggle = useCallback(() => setArmed((current) => !current), [])

  const feed = useCallback(
    (nodeId: string): CanvasAssistantPickResult => {
      const result = resolveCanvasAssistantPick(nodes, nodeId, {
        getNodeTypeLabel,
        selectedReferences,
        pickedNodeIds,
      })
      if (result.kind === 'reference') {
        onAddReference(result.reference)
      } else if (result.kind === 'node') {
        setPickedNodeIds((current) =>
          current.includes(result.nodeId)
            ? current
            : [...current, result.nodeId],
        )
      }
      if (result.kind === 'rejected') onRejected?.(result.reason)
      else onPicked?.(result)
      // 模式**保持** —— 与快投一样「拾一个、再拾一个」，直到 Esc / 空白 / 发送。
      return result
    },
    [
      getNodeTypeLabel,
      nodes,
      onAddReference,
      onPicked,
      onRejected,
      pickedNodeIds,
      selectedReferences,
    ],
  )

  const unpickNode = useCallback((nodeId: string) => {
    setPickedNodeIds((current) => current.filter((id) => id !== nodeId))
  }, [])
  const clearPicks = useCallback(() => setPickedNodeIds([]), [])

  // arm 态高亮：命令式 DOM，节点组件不重渲染。selectedReferences / picked 变了
  // 就重跑（拾一个之后它从「可拾」翻成「已含」）。
  useEffect(() => {
    if (!armed) return
    const touched: HTMLElement[] = []
    for (const node of nodes) {
      const el = findNodeCardElement(node.id)
      if (!el) continue
      el.classList.add(
        isCanvasAssistantPickIncluded(node, {
          selectedReferences,
          pickedNodeIds,
        })
          ? PICK_INCLUDED_CLASS
          : PICK_TARGET_CLASS,
      )
      touched.push(el)
    }
    return () => {
      for (const el of touched) {
        el.classList.remove(PICK_TARGET_CLASS, PICK_INCLUDED_CLASS)
      }
    }
  }, [armed, nodes, pickedNodeIds, selectedReferences])

  // 发布给 workbench 的画布事件 handler（同 `quickThrowApiRef` 的手法）。
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = { armed, arm, feed, exit }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, armed, arm, feed, exit])

  return useMemo(
    () => ({
      armed,
      arm,
      exit,
      toggle,
      feed,
      pickedNodeIds,
      unpickNode,
      clearPicks,
    }),
    [armed, arm, exit, toggle, feed, pickedNodeIds, unpickNode, clearPicks],
  )
}
