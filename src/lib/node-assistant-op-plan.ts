/**
 * 助手 op 的规划器（包 5）—— **合法性在这里，不在提示词里**。
 *
 * 一条 op 能不能做，答案必须来自和人手同一个事实源：
 *   · 连线 → `evaluateCastIngest`（自环 / 类型 / 重复边 / 参考位容量）
 *   · 审核 → `canAssistantSetReviewState`（`approved` 助手写不了，§4.2 Q4）
 *   · 生成 → 与 workbench 的 `handleGenerateMediaNode` 同一组前提（有媒体类型、
 *     有模型）
 * 写进提示词的规则模型总会滑出去；写成守卫的规则不会。
 *
 * ⚠ **类型矩阵今天是空门**：`canConnectNodeTypes` 自 2026-07-28 起恒返回 true
 * （owner「全部放开」）。所以本包的验收判据不能是「类型不符被拒」——那条今天证
 * 不出来。真正还在拒绝的是自环 / 重复边 / 参考位。这里仍然走
 * `evaluateCastIngest` 而不是自己判：矩阵将来恢复时，助手自动跟着收紧。
 *
 * ── 为什么要模拟 ────────────────────────────────────────────────────
 * 一次提案里「新建角色 → 连到镜头」是常态，而新节点在规划时还没有 id。所以规划
 * 器在一份**模拟图**上推进：`add_node` 先落一个占位节点，后面的 connect 就能在
 * 同一张图上被真正校验（重复边、参考位都算得准），而不是碰到新节点就跳过检查。
 */

import {
  NODE_ASSISTANT_OP_IDS,
  NODE_ASSISTANT_OP_REJECT_REASON_IDS,
  type NodeAssistantOpRejectReason,
} from '@/constants/node-assistant-ops'
import { getCanvasAddCatalogItem } from '@/constants/canvas-add-catalog'
import { type NodeStudioIngestRejectReason } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import { canAssistantSetReviewState } from '@/lib/node-media-review'
import { getNodeMediaUrl, isIdentityCardNode } from '@/lib/node-workflow-graph'
import { evaluateCastIngest } from '@/hooks/node/use-cast-ingest'
import type {
  NodeAssistantOp,
  NodeAssistantOpBatch,
} from '@/types/node-assistant-ops'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

/** 只活在一次规划里的占位 id 前缀，绝不进图、绝不进持久化。 */
const PENDING_NODE_ID_PREFIX = 'canvas-op-pending:'

export type NodeAssistantOpPlanRejectReason =
  | NodeAssistantOpRejectReason
  | NodeStudioIngestRejectReason

/**
 * 一个引用解析成了什么。执行层据此决定去图里找现成节点，还是用本批刚建出来的
 * 那个 —— 所以这里给的是 `ref`，不是规划期的占位 id（占位 id 出了这个模块就没有
 * 意义）。
 */
export type NodeAssistantOpNodeRef =
  | { kind: 'existing'; nodeId: string }
  | { kind: 'pending'; ref: string }

export interface PlannedNodeAssistantOp {
  /** 在原提案里的下标 —— 卡上按这个顺序显示，执行也按这个顺序。 */
  index: number
  op: NodeAssistantOp
  status: 'ready' | 'rejected'
  reason?: NodeAssistantOpPlanRejectReason
  /** 只有 `capacityFull` 会带，用来显示「参考位 n/m」。 */
  capacity?: { current: number; limit: number }
  source?: NodeAssistantOpNodeRef
  target?: NodeAssistantOpNodeRef
  /** `set_review_state` 的落点（审核态按 URL 键控）。 */
  mediaUrl?: string
}

export interface NodeAssistantOpPlan {
  ops: PlannedNodeAssistantOp[]
  /** 可执行的结构操作 —— 整批一次应用的那一堆。 */
  readyStructuralCount: number
  /** 可执行且**会扣 credit** 的 op，审批上必须单独确认。 */
  readyGenerateCount: number
  rejectedCount: number
}

function createPendingNode(
  index: number,
  op: Extract<NodeAssistantOp, { op: 'add_node' }>,
): NodeWorkflowNode {
  const item = getCanvasAddCatalogItem(op.intent)
  return {
    id: `${PENDING_NODE_ID_PREFIX}${index}`,
    type: item.nodeType,
    position: { x: 0, y: 0 },
    // 模拟节点只需要合法性判据读得到的那几样：type / role / （没有）model /
    // （没有）媒体。刻意不调 `createDefaultNodeData` —— 那是执行层的事，规划期
    // 复制一份默认值只会多出一处会漂移的副本。
    data: {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      ...(item.role ? { role: item.role } : {}),
    },
  }
}

/**
 * 把一批 op 排成「哪些能做、哪些不能做以及为什么」。纯函数：不碰图、不碰 React、
 * 不读时钟。
 */
export function planNodeAssistantOps(
  batch: NodeAssistantOpBatch,
  nodes: readonly NodeWorkflowNode[],
  edges: readonly NodeWorkflowEdge[],
): NodeAssistantOpPlan {
  const simulatedNodes: NodeWorkflowNode[] = [...nodes]
  const simulatedEdges: NodeWorkflowEdge[] = [...edges]
  /** ref → 模拟图里的占位 id。 */
  const pendingIdByRef = new Map<string, string>()
  const existingIds = new Set(nodes.map((node) => node.id))
  const planned: PlannedNodeAssistantOp[] = []

  function resolve(
    reference: string,
  ): { ref: NodeAssistantOpNodeRef; nodeId: string } | null {
    const pendingId = pendingIdByRef.get(reference)
    if (pendingId) {
      return { ref: { kind: 'pending', ref: reference }, nodeId: pendingId }
    }
    if (existingIds.has(reference)) {
      return { ref: { kind: 'existing', nodeId: reference }, nodeId: reference }
    }
    return null
  }

  batch.ops.forEach((op, index) => {
    switch (op.op) {
      case NODE_ASSISTANT_OP_IDS.addNode: {
        // 别名撞车（重复声明，或与画布上已有节点 id 同名）会让后面的引用指向不
        // 明 —— 与其挑一个赢家，不如整条拒掉并说清楚。
        if (op.ref && (pendingIdByRef.has(op.ref) || existingIds.has(op.ref))) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.duplicateRef,
          })
          return
        }
        const pendingNode = createPendingNode(index, op)
        simulatedNodes.push(pendingNode)
        if (op.ref) pendingIdByRef.set(op.ref, pendingNode.id)
        planned.push({
          index,
          op,
          status: 'ready',
          ...(op.ref ? { target: { kind: 'pending', ref: op.ref } } : {}),
        })
        return
      }

      case NODE_ASSISTANT_OP_IDS.connect: {
        const source = resolve(op.source)
        const target = resolve(op.target)
        if (!source || !target) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
            ...(source ? { source: source.ref } : {}),
            ...(target ? { target: target.ref } : {}),
          })
          return
        }
        const sourceNode = simulatedNodes.find(
          (node) => node.id === source.nodeId,
        )
        const targetNode = simulatedNodes.find(
          (node) => node.id === target.nodeId,
        )
        if (!sourceNode || !targetNode) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
          })
          return
        }
        // 自环在这里会以 `typeMismatch` 回来 —— 用的是人手拖拽同一套词表，不为
        // 助手另造一个「不能连自己」的说法。
        const evaluation = evaluateCastIngest(
          sourceNode,
          targetNode,
          simulatedEdges,
          simulatedNodes,
        )
        if (!evaluation.legal) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: evaluation.reason,
            ...(evaluation.current !== undefined &&
            evaluation.limit !== undefined
              ? {
                  capacity: {
                    current: evaluation.current,
                    limit: evaluation.limit,
                  },
                }
              : {}),
            source: source.ref,
            target: target.ref,
          })
          return
        }
        simulatedEdges.push({
          id: `${PENDING_NODE_ID_PREFIX}edge:${index}`,
          source: sourceNode.id,
          target: targetNode.id,
        })
        planned.push({
          index,
          op,
          status: 'ready',
          source: source.ref,
          target: target.ref,
        })
        return
      }

      case NODE_ASSISTANT_OP_IDS.rename: {
        const target = resolve(op.target)
        planned.push({
          index,
          op,
          status: target ? 'ready' : 'rejected',
          ...(target
            ? { target: target.ref }
            : { reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode }),
        })
        return
      }

      case NODE_ASSISTANT_OP_IDS.setReviewState: {
        // 目标先解析出来 —— 即使这条要被拒，卡上也得说清「它想动的是哪一张」。
        // 但**理由的优先级**是另一回事：自批的禁令要压过「没有媒体」，否则一条
        // 想自批的 op 会因为目标没图而报成 `noMedia`，真正的禁令就说没了。
        const target = resolve(op.target)
        if (!canAssistantSetReviewState(op.state)) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.approvalForbidden,
            ...(target ? { target: target.ref } : {}),
          })
          return
        }
        if (!target) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
          })
          return
        }
        const targetNode = simulatedNodes.find(
          (node) => node.id === target.nodeId,
        )
        const mediaUrl = targetNode
          ? getNodeMediaUrl(targetNode.data)
          : undefined
        if (!mediaUrl) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.noMedia,
            target: target.ref,
          })
          return
        }
        planned.push({
          index,
          op,
          status: 'ready',
          target: target.ref,
          mediaUrl,
        })
        return
      }

      case NODE_ASSISTANT_OP_IDS.generate: {
        const target = resolve(op.target)
        if (!target) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
          })
          return
        }
        const targetNode = simulatedNodes.find(
          (node) => node.id === target.nodeId,
        )
        const kind = targetNode
          ? NODE_MEDIA_KIND_BY_NODE_TYPE[targetNode.type]
          : undefined
        // ⚠ 卡片（角色卡 / 背景卡）**不是生成目标**：它是身份档案夹，收集同一个主体
        // 的图，自己不产图。助手要出图就落在图片节点上，卡片只负责引用
        // （owner 2026-08-08）。与 `inferComposerHost` 的卡片闸门同一条判据 ——
        // 卡片的 media kind 也是 image，只按 kind 判会让助手把结果写进卡片。
        if (
          !targetNode ||
          !kind ||
          kind === NODE_MEDIA_KIND_IDS.text ||
          isIdentityCardNode(targetNode)
        ) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notGeneratable,
            target: target.ref,
          })
          return
        }
        if (!targetNode.data.model) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.noModel,
            target: target.ref,
          })
          return
        }
        planned.push({ index, op, status: 'ready', target: target.ref })
        return
      }
    }
  })

  const readyGenerateCount = planned.filter(
    (entry) =>
      entry.status === 'ready' &&
      entry.op.op === NODE_ASSISTANT_OP_IDS.generate,
  ).length
  const readyCount = planned.filter((entry) => entry.status === 'ready').length

  return {
    ops: planned,
    readyStructuralCount: readyCount - readyGenerateCount,
    readyGenerateCount,
    rejectedCount: planned.length - readyCount,
  }
}
