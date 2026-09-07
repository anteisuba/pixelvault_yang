'use client'

/**
 * ⚠ **③d 翻转后删**（第三期 · 画布 C3c-③b）。
 *
 * 这不是兼容层，是**迁移顺序**：13 个画布外壳组件已经改成只认
 * `useNodeCanvasActions()`（v4 op 语义），但画布本体在 ③d 之前跑的还是 v3
 * (`useNodeWorkflow` + `NodeWorkflowActionsContext`)。这个组件把 v3 的动作包成
 * 同一个形状，让两边**同时活着**且外壳只有一份实现。翻转那一天：workbench 改挂
 * `NodeV4Provider` 一侧的实现，本文件与 `NodeWorkflowActionsContext` 一起删。
 *
 * ⛔ 不要往这里加新能力。要加动作就加在 `NodeCanvasActions` 契约与 v4 op 表上，
 * 然后两侧各接一次 —— 只往这一侧加，等于给自己留了一条翻转后凭空消失的路径。
 */

import { useMemo } from 'react'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import { approveMedia, rejectMedia } from '@/lib/node-media-review'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../../NodeWorkflowActionsContext'
import {
  NodeCanvasActionsProvider,
  type NodeCanvasActions,
  type NodeCanvasRunState,
} from './NodeV4ActionsBridge'

/** 运行态三档 → v3 节点上那两个字段。翻转后这张表随本文件一起消失。 */
function runStatePatch(runState: NodeCanvasRunState) {
  if (runState === 'running') {
    return {
      generationStatus: NODE_GENERATION_STATUS_IDS.pending,
      status: NODE_STATUS_IDS.running,
    }
  }
  if (runState === 'success') {
    return {
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      status: NODE_STATUS_IDS.done,
    }
  }
  return {
    generationStatus: NODE_GENERATION_STATUS_IDS.error,
    status: NODE_STATUS_IDS.failed,
  }
}

export interface NodeV4ActionsV3AdapterProps {
  /** 当前图的节点 —— `set_review_state` 要读目标节点已有的审核记录。 */
  readonly nodes: readonly NodeWorkflowNode[]
  readonly children: React.ReactNode
}

export function NodeV4ActionsV3Adapter({
  nodes,
  children,
}: NodeV4ActionsV3AdapterProps) {
  const v3 = useNodeWorkflowActions()

  const value = useMemo<NodeCanvasActions>(() => {
    return {
      applyOp: async (op) => {
        switch (op.op) {
          case NODE_ASSISTANT_OP_V4_IDS.delete: {
            v3.deleteNode(op.target)
            return
          }
          case NODE_ASSISTANT_OP_V4_IDS.setReviewState: {
            const node = nodes.find((candidate) => candidate.id === op.target)
            if (!node) return
            const reviewedAt = new Date().toISOString()
            const patch =
              op.state === 'approved'
                ? approveMedia(node.data, op.url, { reviewedAt })
                : rejectMedia(node.data, op.url, {
                    reviewedAt,
                    ...(op.reason ? { reason: op.reason } : {}),
                    ...(op.promptPatch ? { promptPatch: op.promptPatch } : {}),
                  })
            v3.updateNodeData(op.target, patch)
            return
          }
          default:
            // ⚠ 出声而不是静默：v3 这一侧没接的 op 说明有人绕过了「两侧各接一次」
            // 的纪律，翻转前它会安静地什么都不做，翻转后又突然生效。
            throw new Error(`NodeV4ActionsV3Adapter: unmapped v4 op "${op.op}"`)
        }
      },
      focusNode: (nodeId) => v3.focusNode?.(nodeId),
      focusGeneratedNodes: () => v3.focusGeneratedNodes?.(),
      undo: () => v3.undo(),
      setNodeRunState: (nodeId, runState) =>
        v3.updateNodeData(nodeId, runStatePatch(runState)),
      placeDerivedImages: (sourceNodeId, outputs) =>
        v3.placeDerivedImages?.(sourceNodeId, outputs) ?? [],
      spawnReference: (input) => v3.spawnReference?.(input) ?? null,
      listCanvasImageSources: (excludeNodeId) =>
        v3.listCanvasImageSources?.(excludeNodeId) ?? [],
      connectReferenceNode: (sourceNodeId, targetNodeId) =>
        v3.connectReferenceNode?.(sourceNodeId, targetNodeId) ?? false,
      runAssistantOps: async (ops) =>
        (await v3.runAssistantCanvasOps?.(ops)) ?? {
          applied: 0,
          skipped: ops.length,
          failedConnects: 0,
          createdNodeIds: [],
        },
      reviewMode: v3.reviewMode,
      regenerateForReview: async (nodeId, promptAppend) => {
        await v3.regenerateForReview?.(nodeId, promptAppend)
      },
      scriptDoc: {
        stage: v3.scriptDocStage,
        depth: v3.scriptDocDepth,
        locks: v3.scriptDocLocks,
        shotStills: v3.scriptDocShotStills,
        setStage: v3.setScriptDocStage,
        setDepth: v3.setScriptDocDepth,
        setLocks: v3.setScriptDocLocks,
        setShotStills: v3.setScriptDocShotStills,
        setDoc: v3.setScriptDoc,
        applyToGraph: v3.applyScriptDocToGraph,
        previewProjection: v3.previewScriptDocProjection,
      },
    }
  }, [nodes, v3])

  return (
    <NodeCanvasActionsProvider value={value}>
      {children}
    </NodeCanvasActionsProvider>
  )
}
