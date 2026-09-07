/**
 * v4 op 执行器（node-canvas-v2 §5 / §7）。一条 op → 新 state + inverse + 变更集。
 *
 * ── 三条纪律（§5）在代码里的落点 ────────────────────────────────────────
 * 1. `connect` / `attach_asset` 的载荷里**只有节点引用没有 URL** —— 这里也只按 id
 *    找节点，⛔ 不接受任何外来 URL。
 * 2. **每条 op 必须能算出 inverse**，否则不进自动落集合。算不出来的（`generate`、
 *    读类）在这里直接返回 `handled: false`，由调用方走各自的路径。
 * 3. `generate` 是唯一扣 credit 的 op，**执行留客户端**：这里不碰它。
 *
 * ⚠ `delete` 的 inverse 需要整份 data 快照 + 边列表 + 各槽 `versions`/`cur`，
 * 所以它的 inverse 不是一条 op 而是一份 `restore` 载荷（`NodeAssistantOpV4Schema`
 * 里没有 restore —— 撤销走本模块的 `applyInverseV4`，不回服务端）。
 *
 * ⛔ 纯函数：不碰 DOM、不发请求、不读时钟（`now` 注入）。
 */

import {
  NODE_ASSISTANT_OP_V4_IDS,
  type NodeAssistantWriteMode,
} from '@/constants/node-assistant-ops'
import { NODE_SLOT_OUTPUT_IDS, type NodeSlotId } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { NODE_V4_SUBTYPE_LABELS } from '@/constants/node-studio'
import { buildStableNodeName } from '@/lib/node-display-name'
import {
  looseAreaSpawn,
  moveNodeToShot,
  reorderShots,
  shotSpawnPosition,
} from '@/lib/node-shot-layout'
import {
  connectIntoSlot,
  disconnectEdge,
  markVersionBlocked,
  setSlotVersion,
} from '@/lib/node-slot-binding'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  NodeV4DataSchema,
  type NodeV4,
  type NodeWorkflowModelSelection as NodeV4Model,
  type NodeV4Data,
  type NodeWorkflowEdgeV4,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

/**
 * 撤销载荷。多数 op 的 inverse 就是另一条 op；`delete` 例外，它要整份快照。
 * 助手的**一轮 = 一个 undo 条目**（§7），所以调用方收集的是一个 `NodeV4Inverse[]`，
 * 撤销时**逆序**回放。
 */
export type NodeV4Inverse =
  | { readonly kind: 'op'; readonly op: NodeAssistantOpV4 }
  | {
      readonly kind: 'restore'
      readonly nodes: readonly NodeV4[]
      readonly edges: readonly NodeWorkflowEdgeV4[]
    }
  | {
      readonly kind: 'removeNode'
      readonly nodeId: string
    }

export interface ApplyOpV4Context {
  readonly now?: string
  /** 新 id 生成器（画布传 ReactFlow 的 id 规则，测试注入可预测值）。 */
  mintId(prefix: string): string
  /** 批内别名 → 真 id（`add_node` 的 `ref` 供同批 connect 引用）。 */
  readonly refs?: Map<string, string>
  /**
   * `modelId` → 完整的模型选择（adapter / provider / apiKey）。助手只吐 modelId，
   * 展开成一份可用的选择是画布手上的事（`resolve()` 阶段），⛔ 不让模型编 adapter。
   * 不给这个函数 = `set_model` 在没有旧选择可继承时**失败可见**，不静默半写。
   */
  resolveModel?(modelId: string): NodeV4Model | undefined
}

export type ApplyOpV4Result =
  | {
      readonly ok: true
      readonly state: NodeWorkflowStateV4
      readonly inverse: NodeV4Inverse
      /** 这条 op 改到了哪些节点（§7 变更高亮的输入）。 */
      readonly changedNodeIds: readonly string[]
      /** 新建 / 改动的边（边脉冲的输入）。 */
      readonly changedEdgeIds: readonly string[]
    }
  | { readonly ok: false; readonly reason: string }
  /** 不归本模块管（读类 / `generate` 走客户端确认路径）。 */
  | {
      readonly ok: false
      readonly reason: 'notHandled'
      readonly handled: false
    }

const NOT_HANDLED = {
  ok: false,
  reason: 'notHandled',
  handled: false,
} as const

function resolveTarget(
  state: NodeWorkflowStateV4,
  target: string,
  refs?: Map<string, string>,
): NodeV4 | undefined {
  const id = refs?.get(target) ?? target
  return state.nodes.find((node) => node.id === id)
}

function replaceNodeData(
  state: NodeWorkflowStateV4,
  nodeId: string,
  patch: (data: NodeV4Data) => NodeV4Data,
): NodeWorkflowStateV4 {
  return {
    ...state,
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? { ...node, data: patch(node.data) } : node,
    ),
  }
}

function applyWriteMode(
  previous: string,
  next: string,
  mode: NodeAssistantWriteMode,
): string {
  // `suggest` 不落文本——它是「给个建议让用户点」，落不落由 UI 决定。
  if (mode === 'append') return previous ? `${previous}\n\n${next}` : next
  return next
}

/** 一条 op → 新 state。⚠ 逐条应用，调用方负责把一轮的结果收成一个 undo 条目。 */
export function applyNodeAssistantOpV4(
  state: NodeWorkflowStateV4,
  op: NodeAssistantOpV4,
  context: ApplyOpV4Context,
): ApplyOpV4Result {
  const now = context.now ?? new Date().toISOString()
  const ids = NODE_ASSISTANT_OP_V4_IDS

  switch (op.op) {
    case ids.readCanvas:
    case ids.findNode:
    case ids.generate:
      return NOT_HANDLED

    case ids.addNode: {
      const kind = op.kind as NodeWorkflowMediaKind
      const subtype = op.subtype as NodeV4Subtype
      const id = context.mintId(kind)
      const taken = new Set(state.nodes.map((node) => node.data.name))
      let name: string
      try {
        name =
          op.name ??
          buildStableNodeName(
            { kind, subtype, shotNo: op.shotNo },
            {
              labelOf: (k, s) => NODE_V4_SUBTYPE_LABELS[`${k}.${s}`] ?? s,
              taken,
            },
          )
      } catch {
        return { ok: false, reason: 'nameExhausted' }
      }
      const position =
        op.position ??
        (op.shotNo === undefined
          ? looseAreaSpawn(
              state.nodes.filter((node) => node.data.shotNo === undefined)
                .length,
            )
          : shotSpawnPosition(state.nodes, state.edges, op.shotNo))

      const base = {
        kind,
        subtype,
        name,
        status: 'idle',
        createdAt: now,
        ...(op.shotNo === undefined ? {} : { shotNo: op.shotNo }),
        ...(kind === NODE_MEDIA_KIND_IDS.text ? { body: '' } : {}),
      }
      const parsed = NodeV4DataSchema.safeParse(base)
      if (!parsed.success) return { ok: false, reason: 'invalidSubtype' }

      const node: NodeV4 = { id, position, data: parsed.data }
      if (op.ref) context.refs?.set(op.ref, id)
      return {
        ok: true,
        state: { ...state, nodes: [...state.nodes, node] },
        inverse: { kind: 'removeNode', nodeId: id },
        changedNodeIds: [id],
        changedEdgeIds: [],
      }
    }

    case ids.connect:
    case ids.attachAsset: {
      const sourceRef = op.op === ids.connect ? op.source : op.sourceNodeId
      const source = resolveTarget(state, sourceRef, context.refs)
      const target = resolveTarget(state, op.target, context.refs)
      if (!source || !target) return { ok: false, reason: 'unknownNode' }
      const result = connectIntoSlot(state, {
        source: source.id,
        target: target.id,
        slot: op.slot as NodeSlotId,
        sourceHandle:
          op.op === ids.connect
            ? (op.sourceHandle ?? NODE_SLOT_OUTPUT_IDS.out)
            : NODE_SLOT_OUTPUT_IDS.out,
        edgeId: context.mintId('e'),
        now,
      })
      if (!result.ok) return { ok: false, reason: result.reason }
      return {
        ok: true,
        state: result.state,
        inverse: {
          kind: 'op',
          op: { op: ids.disconnect, edgeId: result.edgeId },
        },
        changedNodeIds: [target.id],
        changedEdgeIds: [result.edgeId],
      }
    }

    case ids.disconnect: {
      const { state: next, removed } = disconnectEdge(state, op.edgeId, { now })
      if (!removed) return { ok: false, reason: 'unknownEdge' }
      return {
        ok: true,
        state: next,
        inverse: {
          kind: 'op',
          op: {
            op: ids.connect,
            source: removed.source,
            sourceHandle: removed.sourceHandle,
            target: removed.target,
            slot: removed.slot,
          },
        },
        changedNodeIds: [removed.target],
        changedEdgeIds: [removed.id],
      }
    }

    case ids.delete: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      const touchedEdges = state.edges.filter(
        (edge) => edge.source === node.id || edge.target === node.id,
      )
      let next: NodeWorkflowStateV4 = state
      for (const edge of touchedEdges) {
        next = disconnectEdge(next, edge.id, { now }).state
      }
      next = {
        ...next,
        nodes: next.nodes.filter((item) => item.id !== node.id),
      }
      // inverse 要整份 data 快照 + 边列表 + 各槽 versions/cur —— 够贵，所以
      // `delete` 不自动落（§5 纪律 2）。
      return {
        ok: true,
        state: next,
        inverse: { kind: 'restore', nodes: [node], edges: touchedEdges },
        changedNodeIds: [node.id],
        changedEdgeIds: touchedEdges.map((edge) => edge.id),
      }
    }

    case ids.moveToShot: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      const previous = node.data.shotNo ?? null
      return {
        ok: true,
        state: moveNodeToShot(state, node.id, op.shotNo),
        inverse: {
          kind: 'op',
          op: { op: ids.moveToShot, target: node.id, shotNo: previous },
        },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.reorderShot: {
      const next = reorderShots(state, op.from, op.to)
      if (next === state) return { ok: false, reason: 'unknownShot' }
      return {
        ok: true,
        state: next,
        // 整次换序是**一步**（§6）：inverse 也是一条反向 reorder。
        inverse: {
          kind: 'op',
          op: { op: ids.reorderShot, from: op.to, to: op.from },
        },
        changedNodeIds: next.nodes
          .filter((node) => node.data.shotNo !== undefined)
          .map((node) => node.id),
        changedEdgeIds: [],
      }
    }

    case ids.setSlotVersion: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      const previous = node.data.slots?.[op.slot as NodeSlotId]?.cur
      const result = setSlotVersion(
        state,
        node.id,
        op.slot as NodeSlotId,
        op.versionId,
      )
      if (!result.ok) return { ok: false, reason: result.reason }
      return {
        ok: true,
        state: result.state,
        inverse: previous
          ? {
              kind: 'op',
              op: {
                op: ids.setSlotVersion,
                target: node.id,
                slot: op.slot,
                versionId: previous,
              },
            }
          : { kind: 'restore', nodes: [node], edges: [] },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.markVersionBlocked: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      const version = node.data.slots?.[op.slot as NodeSlotId]?.versions.find(
        (item) => item.id === op.versionId,
      )
      const result = markVersionBlocked(
        state,
        node.id,
        op.slot as NodeSlotId,
        op.versionId,
        op.blocked,
        op.reason,
      )
      if (!result.ok) return { ok: false, reason: result.reason }
      return {
        ok: true,
        state: result.state,
        inverse: {
          kind: 'op',
          op: {
            op: ids.markVersionBlocked,
            target: node.id,
            slot: op.slot,
            versionId: op.versionId,
            blocked: version?.blocked ?? false,
            ...(version?.blockedReason
              ? { reason: version.blockedReason }
              : {}),
          },
        },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.setText: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (node.data.kind !== NODE_MEDIA_KIND_IDS.text) {
        return { ok: false, reason: 'notATextNode' }
      }
      const previous = node.data.body
      const body = applyWriteMode(previous, op.body, op.mode)
      return {
        ok: true,
        state: replaceNodeData(state, node.id, (data) => ({ ...data, body })),
        inverse: {
          kind: 'op',
          op: {
            op: ids.setText,
            target: node.id,
            body: previous || ' ',
            mode: 'replace',
          },
        },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.setPrompt: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (node.data.kind === NODE_MEDIA_KIND_IDS.text) {
        return { ok: false, reason: 'notAGeneratedNode' }
      }
      const previous = node.data.prompt ?? ''
      const prompt = applyWriteMode(previous, op.prompt, op.mode)
      return {
        ok: true,
        state: replaceNodeData(state, node.id, (data) => ({ ...data, prompt })),
        inverse: {
          kind: 'op',
          op: {
            op: ids.setPrompt,
            target: node.id,
            prompt: previous || ' ',
            mode: 'replace',
          },
        },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.setField: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      const field = op.field
      // `shotNo` 走 move_to_shot 的路径 —— 名字里的 `S<nn>` 段必须跟着走，
      // 直接写字段会让名字和镜号对不上（§4.2 末条）。
      if (field === 'shotNo') {
        const shotNo = typeof op.value === 'number' ? op.value : null
        const previous = node.data.shotNo ?? null
        return {
          ok: true,
          state: moveNodeToShot(state, node.id, shotNo),
          inverse: {
            kind: 'op',
            op: { op: ids.moveToShot, target: node.id, shotNo: previous },
          },
          changedNodeIds: [node.id],
          changedEdgeIds: [],
        }
      }
      const before = (node.data as Record<string, unknown>)[field]
      const nextData = { ...node.data } as Record<string, unknown>
      if (op.value === null || op.value === '') delete nextData[field]
      else nextData[field] = op.value
      const parsed = NodeV4DataSchema.safeParse(nextData)
      if (!parsed.success) return { ok: false, reason: 'invalidFieldValue' }
      return {
        ok: true,
        state: replaceNodeData(state, node.id, () => parsed.data),
        inverse: {
          kind: 'op',
          op: {
            op: ids.setField,
            target: node.id,
            field,
            value:
              typeof before === 'string' ||
              typeof before === 'number' ||
              typeof before === 'boolean'
                ? before
                : null,
          },
        },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.setModel: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (node.data.kind === NODE_MEDIA_KIND_IDS.text) {
        return { ok: false, reason: 'notAGeneratedNode' }
      }
      const previous = node.data.model
      const model: NodeV4Model | undefined = previous
        ? { ...previous, modelId: op.modelId }
        : context.resolveModel?.(op.modelId)
      if (!model) return { ok: false, reason: 'modelNotResolvable' }
      return {
        ok: true,
        state: replaceNodeData(state, node.id, (data) => ({ ...data, model })),
        inverse: previous?.modelId
          ? {
              kind: 'op',
              op: {
                op: ids.setModel,
                target: node.id,
                modelId: previous.modelId,
              },
            }
          : { kind: 'restore', nodes: [node], edges: [] },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.setParams: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (
        node.data.kind !== NODE_MEDIA_KIND_IDS.image &&
        node.data.kind !== NODE_MEDIA_KIND_IDS.video
      ) {
        return { ok: false, reason: 'notAGeneratedNode' }
      }
      const previous = node.data.params
      return {
        ok: true,
        state: replaceNodeData(state, node.id, (data) => ({
          ...data,
          params: { ...previous, ...op.params },
        })),
        inverse: previous
          ? {
              kind: 'op',
              op: { op: ids.setParams, target: node.id, params: previous },
            }
          : { kind: 'restore', nodes: [node], edges: [] },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.setReviewState: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (
        node.data.kind !== NODE_MEDIA_KIND_IDS.image &&
        node.data.kind !== NODE_MEDIA_KIND_IDS.video
      ) {
        return { ok: false, reason: 'notAReviewableNode' }
      }
      const previous = node.data.mediaReview?.[op.url]
      const review = {
        ...node.data.mediaReview,
        [op.url]: {
          ...previous,
          state: op.state,
          ...(op.reason ? { reason: op.reason } : {}),
        },
      }
      const parsed = NodeV4DataSchema.safeParse({
        ...node.data,
        mediaReview: review,
      })
      if (!parsed.success) return { ok: false, reason: 'invalidReviewState' }
      return {
        ok: true,
        state: replaceNodeData(state, node.id, () => parsed.data),
        inverse: { kind: 'restore', nodes: [node], edges: [] },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    default:
      return NOT_HANDLED
  }
}

/**
 * 撤销一条 op（§7）。助手的一轮 = 一个 undo 条目，所以调用方拿到 `NodeV4Inverse[]`
 * 之后**逆序**回放。
 */
export function applyInverseV4(
  state: NodeWorkflowStateV4,
  inverse: NodeV4Inverse,
  context: ApplyOpV4Context,
): NodeWorkflowStateV4 {
  if (inverse.kind === 'removeNode') {
    const edges = state.edges.filter(
      (edge) =>
        edge.source !== inverse.nodeId && edge.target !== inverse.nodeId,
    )
    return {
      ...state,
      nodes: state.nodes.filter((node) => node.id !== inverse.nodeId),
      edges,
    }
  }
  if (inverse.kind === 'restore') {
    const restoredIds = new Set(inverse.nodes.map((node) => node.id))
    const restoredEdgeIds = new Set(inverse.edges.map((edge) => edge.id))
    return {
      ...state,
      nodes: [
        ...state.nodes.filter((node) => !restoredIds.has(node.id)),
        ...inverse.nodes,
      ],
      edges: [
        ...state.edges.filter((edge) => !restoredEdgeIds.has(edge.id)),
        ...inverse.edges,
      ],
    }
  }
  const result = applyNodeAssistantOpV4(state, inverse.op, context)
  return result.ok ? result.state : state
}
