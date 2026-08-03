'use client'

import { useCallback } from 'react'

import { useNodeWorkflowActions } from '@/components/business/node/NodeWorkflowActionsContext'

/**
 * 从详情面板里跳到画布上的另一个节点。
 *
 * ⚠ **必须先关面板，再 fitView。** 顺序反了看不出错，只是「什么都没发生」——
 * 面板是居中浮层且带遮罩，画布在它后面平移，用户一帧都看不见。
 * 这个理由此前只写在 `CharacterImageInspector` 的一段注释里；关系带扩到全族之后
 * 有十个调用点，把它留在某一族的注释里等于让另外九个各自重新发现一遍。
 *
 * 与 `expandedNodeId` 悬空的关系：本 hook 是 `setExpandedNodeId(null)` 的主要
 * 生产调用点（从 2 处扩到 10 处）。判据侧已在 `StudioNodeWorkbench` 修好
 * （`heavyOverlayOpen` 改判「壳是否真在渲染」+ 悬空 id 自动清理），
 * 所以这里可以放心地只管「关面板 + 聚焦」。
 */
export function useFocusCanvasNode(): (nodeId: string) => void {
  const { setExpandedNodeId, focusNode } = useNodeWorkflowActions()

  return useCallback(
    (nodeId: string) => {
      setExpandedNodeId(null)
      focusNode?.(nodeId)
    },
    [focusNode, setExpandedNodeId],
  )
}
