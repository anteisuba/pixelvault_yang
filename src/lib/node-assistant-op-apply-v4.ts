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
import {
  NODE_EDGE_VIA_IDS,
  NODE_SLOT_OUTPUT_IDS,
  type NodeSlotId,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { NODE_V4_SUBTYPE_LABELS } from '@/constants/node-studio'
import { buildShotLabel, buildStableNodeName } from '@/lib/node-display-name'
import {
  looseAreaSpawn,
  moveNodeToShot,
  reorderShots,
  shotSpawnPosition,
} from '@/lib/node-shot-layout'
import {
  resolveMentionsToSlots,
  type MentionCastCardRef,
} from '@/lib/node-mentions-to-slots'
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
  /**
   * 一条 op 改了两处、而两处的撤销是两条不同的 op 时用它（今天只有带
   * `contextCardId` 的 `attach_asset`：既建了边又写了字段）。⛔ 不是给调用方
   * 攒批用的——一轮批次仍然是 `NodeV4Inverse[]` 逆序回放。
   */
  | { readonly kind: 'sequence'; readonly items: readonly NodeV4Inverse[] }

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
  /**
   * 画布上可被 `@` 的角色卡（spec §8.2）。卡住在库里不在图 state 里，所以名字由
   * 调用方给；卡绑的图 / 音色仍从图上反查。不给 = 正文里只认节点名。
   */
  readonly castCards?: readonly MentionCastCardRef[]
  /**
   * 跳过 `set_text` / `set_prompt` 的 `@` 落槽后置钩子。
   *
   * ⚠ **只有 `applyInverseV4` 用它**：撤销一条改正文的 op 时，边的增删已经各自
   * 记在 inverse 序列里了；让回放的 `set_text` 再同步一次等于同一件事做两遍，
   * 且第二遍会铸出新的 edgeId，把序列里后面那条 `disconnect` 指空。
   * ⛔ 不是给调用方「关掉这个功能」的开关。
   */
  readonly skipMentionSync?: boolean
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

/* ─────────────────────────────────────────────────────────────────────────
 * `@` 引用 → 槽绑定（spec §8.2）· `set_text` / `set_prompt` 的后置钩子
 *
 * ── 为什么落在 op 执行器里而不是 hook 里 ──────────────────────────────
 * 「正文里写了 `@首帧 S02`」与「S02 进了首帧槽」是**同一步意图**，两处落地就会
 * 漂：助手发 `set_text` 走执行器、用户敲字走 hook，一边同步一边不同步。放在这里
 * 则两条路共用同一次同步、同一份 inverse，撤销自然是**一个条目**（§7）。
 *
 * ⛔ 不另写一套槽写入：连 / 断仍然是 `connectIntoSlot` / `disconnectEdge` ——
 * 与拖入（`planV4IngestDrop` → `connect` op）、连线（`connect` op）汇到同一处，
 * 三条路的落点因此一定一致（`reconcileStateSlots` 由调用方在提交前跑一次）。
 *
 * ⚠ 被拒的 `@`（容量满 / 槽不收这个 kind）在这里**只是不连**：op 结果没有出声
 * 的通道。理由要出声的地方是渲染层 —— 它自己调 `resolveMentionsToSlots` 拿
 * `rejected` 给 chip 画叉。
 * ───────────────────────────────────────────────────────────────────────── */

interface MentionSyncOutcome {
  readonly state: NodeWorkflowStateV4
  readonly inverses: readonly NodeV4Inverse[]
  readonly changedEdgeIds: readonly string[]
}

function syncMentionSlots(
  state: NodeWorkflowStateV4,
  nodeId: string,
  text: string,
  context: ApplyOpV4Context,
  now: string,
): MentionSyncOutcome {
  if (context.skipMentionSync) {
    return { state, inverses: [], changedEdgeIds: [] }
  }
  const diff = resolveMentionsToSlots(state, nodeId, text, {
    ...(context.castCards ? { castCards: context.castCards } : {}),
  })
  if (diff.toConnect.length === 0 && diff.toDisconnect.length === 0) {
    return { state, inverses: [], changedEdgeIds: [] }
  }

  let next = state
  const inverses: NodeV4Inverse[] = []
  const changedEdgeIds: string[] = []

  for (const plan of diff.toDisconnect) {
    const result = disconnectEdge(next, plan.edgeId, { now })
    if (!result.removed) continue
    next = result.state
    changedEdgeIds.push(plan.edgeId)
    // ⚠ 撤销用 `restore` 而不是一条 `connect` op：那条 op 载荷里没有 `via`，
    // 把边加回来就丢了「这是 @ 建的」，下一次改正文便断不掉它。
    inverses.push({ kind: 'restore', nodes: [], edges: [result.removed] })
  }

  for (const plan of diff.toConnect) {
    const result = connectIntoSlot(next, {
      source: plan.sourceNodeId,
      target: plan.targetNodeId,
      slot: plan.slot,
      edgeId: context.mintId('e'),
      via: NODE_EDGE_VIA_IDS.mention,
      now,
    })
    if (!result.ok) continue
    next = result.state
    changedEdgeIds.push(result.edgeId)
    inverses.push({
      kind: 'op',
      op: {
        op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
        edgeId: result.edgeId,
      },
    })
  }

  return { state: next, inverses, changedEdgeIds }
}

/** 正文 inverse + `@` 引起的边 inverse 收成一条（撤销是**一个**条目）。 */
function withMentionInverse(
  textInverse: NodeV4Inverse,
  sync: MentionSyncOutcome,
): NodeV4Inverse {
  if (sync.inverses.length === 0) return textInverse
  // 逆序回放：先把边退回去，再把正文退回去 —— 正文那条带
  // `skipMentionSync`，⛔ 不会把边再同步一遍。
  return {
    kind: 'sequence',
    items: [...[...sync.inverses].reverse(), textInverse],
  }
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
    /**
     * ⚠ 只重跑下游的规划**同样不改图**（第三期）：它只是把「哪些节点要重跑」
     * 算出来给用户看。真正的重跑是紧随其后的一串 `generate`，而那条照旧走
     * 硬确认、照旧只在客户端执行。⛔ 别在这里顺手把它们跑了。
     */
    case ids.planRerunDownstream:
    case ids.generate:
      return NOT_HANDLED

    case ids.addNode: {
      const kind = op.kind as NodeWorkflowMediaKind
      const subtype = op.subtype as NodeV4Subtype
      const id = context.mintId(kind)
      const taken = new Set(state.nodes.map((node) => node.data.name))
      // `video.shot` 的稳定名是 `label`（C1 契约修正 1）：**必填**，唯一，⛔ 不带
      // `S<nn>` 前缀——前缀是显示时才拼的，落库带上它换一次序就全错。所以镜头节点
      // 的 `name` 与 `label` 写同一个值，其余节点走原来的 `buildStableNodeName`。
      const isShot =
        kind === NODE_MEDIA_KIND_IDS.video &&
        subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      let name: string
      let label: string | undefined
      try {
        if (isShot) {
          const takenLabels = new Set(
            state.nodes
              .map((node) =>
                node.data.kind === NODE_MEDIA_KIND_IDS.video
                  ? node.data.label
                  : undefined,
              )
              .filter((item): item is string => item !== undefined),
          )
          label = buildShotLabel(
            {
              ...(op.name ? { given: op.name } : {}),
            },
            takenLabels,
          )
          name = label
        } else {
          name =
            op.name ??
            buildStableNodeName(
              { kind, subtype, shotNo: op.shotNo },
              {
                labelOf: (k, s) => NODE_V4_SUBTYPE_LABELS[`${k}.${s}`] ?? s,
                taken,
              },
            )
        }
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
        ...(label === undefined ? {} : { label }),
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
      // `role` 只有 `connect` 带（C1 契约修正 2）。不给 = 由 `connectIntoSlot` 按
      // 源节点推，推出来的档满了自动落 `style`——点亮与落点用的是同一个函数。
      const role: NodeSlotTextRole | undefined =
        op.op === ids.connect ? op.role : undefined
      const result = connectIntoSlot(state, {
        source: source.id,
        target: target.id,
        slot: op.slot as NodeSlotId,
        sourceHandle:
          op.op === ids.connect
            ? (op.sourceHandle ?? NODE_SLOT_OUTPUT_IDS.out)
            : NODE_SLOT_OUTPUT_IDS.out,
        edgeId: context.mintId('e'),
        ...(role ? { role } : {}),
        now,
      })
      if (!result.ok) return { ok: false, reason: result.reason }

      const disconnectInverse: NodeV4Inverse = {
        kind: 'op',
        op: { op: ids.disconnect, edgeId: result.edgeId },
      }

      // `attach_asset` 可以顺手把角色卡硬链上去（C1 契约修正 3）。只对图片节点
      // 有意义；⛔ 不在这里校验这张卡存不存在——那是服务端 ownership 的事。
      const contextCardId =
        op.op === ids.attachAsset ? op.contextCardId : undefined
      if (!contextCardId || target.data.kind !== NODE_MEDIA_KIND_IDS.image) {
        return {
          ok: true,
          state: result.state,
          inverse: disconnectInverse,
          changedNodeIds: [target.id],
          changedEdgeIds: [result.edgeId],
        }
      }

      const previousCardId = target.data.contextCardId
      const linked = replaceNodeData(result.state, target.id, (data) => ({
        ...data,
        contextCardId,
      }))
      return {
        ok: true,
        state: linked,
        // 一条 op 改了两处 → inverse 也是两条：先把字段改回去，再删边。
        inverse: {
          kind: 'sequence',
          items: [
            {
              kind: 'op',
              op: {
                op: ids.setField,
                target: target.id,
                field: 'contextCardId',
                value: previousCardId ?? null,
              },
            },
            disconnectInverse,
          ],
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
      const written = replaceNodeData(state, node.id, (data) => ({
        ...data,
        body,
      }))
      const sync = syncMentionSlots(written, node.id, body, context, now)
      return {
        ok: true,
        state: sync.state,
        inverse: withMentionInverse(
          {
            kind: 'op',
            op: {
              op: ids.setText,
              target: node.id,
              body: previous || ' ',
              mode: 'replace',
            },
          },
          sync,
        ),
        changedNodeIds: [node.id],
        changedEdgeIds: sync.changedEdgeIds,
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
      const written = replaceNodeData(state, node.id, (data) => ({
        ...data,
        prompt,
      }))
      const sync = syncMentionSlots(written, node.id, prompt, context, now)
      return {
        ok: true,
        state: sync.state,
        inverse: withMentionInverse(
          {
            kind: 'op',
            op: {
              op: ids.setPrompt,
              target: node.id,
              prompt: previous || ' ',
              mode: 'replace',
            },
          },
          sync,
        ),
        changedNodeIds: [node.id],
        changedEdgeIds: sync.changedEdgeIds,
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
      const clearing = op.value === null || op.value === ''
      if (clearing) delete nextData[field]
      else nextData[field] = op.value
      const parsed = NodeV4DataSchema.safeParse(nextData)
      if (!parsed.success) return { ok: false, reason: 'invalidFieldValue' }
      // 词表是**全体**节点共用的，但每个字段只活在某几种 data 形状上
      // （`label` 只在 video、`contextCardId` 只在 image）。Zod 对象会把不认识的
      // key **静默剥掉**——parse 成功但值没落进去，报 ok 就是骗人。所以写入之后
      // 回读一次：没落住 = 这个字段不属于这种节点，⛔ 不静默成功。
      if (
        !clearing &&
        (parsed.data as Record<string, unknown>)[field] !== op.value
      ) {
        return { ok: false, reason: 'fieldNotOnThisNode' }
      }
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

    case ids.setVoiceProfile: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (node.data.kind !== NODE_MEDIA_KIND_IDS.audio) {
        return { ok: false, reason: 'notAnAudioNode' }
      }
      const previous = node.data.voiceProfile
      // 补丁语义：只带来的那几档被覆盖，没带的留着（「再慢一点」不该把情绪清空）。
      const merged = { ...previous, ...op.profile }
      const parsed = NodeV4DataSchema.safeParse({
        ...node.data,
        voiceProfile: merged,
      })
      // 值域（语速 0.5–2 / 音量 ±20）在这里落地 —— schema 层放宽是为了不让一条越界
      // 的档位把同批其它 op 一起拖垮，但**越界的值不许落进节点**。
      if (!parsed.success) return { ok: false, reason: 'invalidVoiceProfile' }
      return {
        ok: true,
        state: replaceNodeData(state, node.id, () => parsed.data),
        inverse: previous
          ? {
              kind: 'op',
              op: {
                op: ids.setVoiceProfile,
                target: node.id,
                profile: previous,
              },
            }
          : { kind: 'restore', nodes: [node], edges: [] },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.setMergeClips: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (
        node.data.kind !== NODE_MEDIA_KIND_IDS.video ||
        node.data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.merge
      ) {
        return { ok: false, reason: 'notAMergeNode' }
      }
      // 区间必须成立：`start >= end` 的段合并出来是零帧，让它落库等于把一次失败
      // 推迟到后端。⛔ 不静默交换两端 —— 用户看到的数字要和落下去的一致。
      if (
        op.clips.some(
          (clip) =>
            clip.startSec !== undefined &&
            clip.endSec !== undefined &&
            clip.startSec >= clip.endSec,
        )
      ) {
        return { ok: false, reason: 'invalidClipRange' }
      }
      const previous = node.data.mergeSettings
      const parsed = NodeV4DataSchema.safeParse({
        ...node.data,
        mergeSettings: { ...previous, clips: op.clips },
      })
      if (!parsed.success) return { ok: false, reason: 'invalidMergeClips' }
      return {
        ok: true,
        state: replaceNodeData(state, node.id, () => parsed.data),
        inverse: previous?.clips
          ? {
              kind: 'op',
              op: {
                op: ids.setMergeClips,
                target: node.id,
                clips: previous.clips,
              },
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
          ...(op.promptPatch ? { promptPatch: op.promptPatch } : {}),
          // ⚠ 时间戳由执行器盖，不进载荷：让模型（或调用方）自己写「什么时候审
          // 的」，就等于让一个可以撒谎的字段进了账。`context.now` 可注入，所以
          // 这条仍然是可单测的纯函数。
          reviewedAt: now,
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
  if (inverse.kind === 'sequence') {
    return inverse.items.reduce(
      (next, item) => applyInverseV4(next, item, context),
      state,
    )
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
  // ⚠ 回放**不**再跑 `@` 同步：边的增删已经各自记在这条序列里了（见
  // `syncMentionSlots` 头注）。
  const result = applyNodeAssistantOpV4(state, inverse.op, {
    ...context,
    skipMentionSync: true,
  })
  return result.ok ? result.state : state
}
