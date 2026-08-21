/**
 * 助手 op 的规划器（包 5）—— **合法性在这里，不在提示词里**。
 *
 * 一条 op 能不能做，答案必须来自和人手同一个事实源：
 *   · 连线 → `evaluateCastIngest`（自环 / 类型 / 重复边 / 参考位容量）
 *   · 审核 → `canAssistantSetReviewState`（`approved` 助手写不了，§4.2 Q4）
 *   · 生成 → 与 workbench 的 `handleGenerateMediaNode` 同一组前提（有媒体类型、
 *     有模型）
 *   · 分类 → `canCarryImageCategory`（与助手 payload 里那个字段同一条判据）
 *     + `isNodeStudioReferenceRole`（11 个分类的那张表本身）
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
import {
  isNodeStudioReferenceRole,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
  type NodeStudioIngestRejectReason,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import { canAssistantSetReviewState } from '@/lib/node-media-review'
import { canCarryImageCategory } from '@/lib/node-assistant-context'
import { buildAssistantSetImageCategoryPatch } from '@/lib/node-assistant-op-patch'
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

      // 改已有节点的提示词。判据与 `rename` 同款 —— 目标解析得出来就能写，
      // 「哪些节点该有提示词」不在这里判：与 `add_node.prompt` 一致，落到身份卡
      // 这类节点上时照写不误，与人手在同一个字段里打字等价。
      case NODE_ASSISTANT_OP_IDS.setPrompt: {
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

      case NODE_ASSISTANT_OP_IDS.setImageCategory: {
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
        // 「这个节点有没有分类这回事」与助手 payload 里那个字段共用同一条判据
        // （`canCarryImageCategory`）—— 模型看见的和规划器认的必须是同一件事，
        // 否则它会照着 payload 提一条注定被拒的 op。
        if (!targetNode || !canCarryImageCategory(targetNode)) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notCategorizable,
            target: target.ref,
          })
          return
        }
        // ⛔ 收窄，不猜：`isNodeStudioReferenceRole` 是精确相等。模糊匹配一个
        // 分类的代价是关键帧首尾接反，而那在成片里才看得出来。
        if (!isNodeStudioReferenceRole(op.category)) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownCategory,
            target: target.ref,
          })
          return
        }
        if (
          op.category === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID &&
          !op.label?.trim()
        ) {
          planned.push({
            index,
            op,
            status: 'rejected',
            reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.missingCategoryLabel,
            target: target.ref,
          })
          return
        }
        // 模拟图上也标一份：同一批里后面的 op 若读到这个节点，读到的应当是它
        // **将会**变成的样子，而不是提案发出前的旧值。
        const patched: NodeWorkflowNode = {
          ...targetNode,
          data: {
            ...targetNode.data,
            ...buildAssistantSetImageCategoryPatch(op.category, op),
          },
        }
        simulatedNodes.splice(simulatedNodes.indexOf(targetNode), 1, patched)
        planned.push({ index, op, status: 'ready', target: target.ref })
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

      default: {
        /**
         * **编译期穷尽断言** —— 新增一个 op 却没在上面写 case 时，联合类型里还
         * 剩一个成员，赋给 `never` 就红，`npx tsc --noEmit` 直接拦下。
         *
         * ⚠ 这条闸门是为一个真实的静默失败设的：在它之前，漏写 case 的 op 既不会
         * 变成 ready、也不会变成 rejected，而是**直接从 `planned` 里消失** ——
         * 用户看到助手说「已经放好了」，画布上一个节点都没多，卡上连一条被拒的
         * 记录都没有。TS 在这里不会自己报错（`switch` 没有 default 时不检查穷尽）。
         *
         * 运行时抛而不是静默跳过：这一支只有「代码写漏了」一条到达路径（`op` 来自
         * `z.discriminatedUnion` 的解析结果，不可能是别的值），而它一旦真的到达，
         * 只有立刻炸开才不会退化回上面那种「什么都没发生」。
         */
        const unhandled: never = op
        throw new Error(
          `Unhandled node assistant op: ${JSON.stringify(unhandled)}`,
        )
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
