/**
 * v4 op 执行器（node-canvas-v2 §11.2 / §13.2）。一条 op → 新 state + inverse + 变更集。
 *
 * ── 三条纪律（§13.2）在代码里的落点 ────────────────────────────────────────
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
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  NODE_SLOT_TEXT_ROLE_IDS,
  type NodeSlotId,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import {
  NODE_SCRIPT_PROJECTION_MODE_IDS,
  NODE_SCRIPT_SHOT_STATE_IDS,
} from '@/constants/node-script'
import {
  planScriptProjection,
  readScriptShotRef,
  type ScriptProjectionPlan,
} from '@/lib/node-script-projection'
import {
  NODE_V4_OUTPUT_VERSION,
  NODE_V4_SUBTYPE_LABELS,
} from '@/constants/node-studio'
import {
  isMediaNodeData,
  readOutputIndex,
  readOutputVersions,
  selectOutputVersion,
} from '@/lib/node-output-versions'
import { buildShotLabel, buildStableNodeName } from '@/lib/node-display-name'
import {
  looseAreaSpawn,
  moveNodeToShot,
  nextShotNo,
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
import {
  EDIT_TRACK_MAX_CLIPS,
  EDIT_TRANSITION_IDS,
  type EditTrackId,
} from '@/constants/edit-desk'
import {
  clampTextClip,
  clampTrim,
  insertClip,
  moveClip as moveClipInTrack,
  removeClip as removeClipFromTrack,
} from '@/lib/edit-project'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  NodeV4DataSchema,
  type NodeV4,
  type NodeWorkflowModelSelection as NodeV4Model,
  type EditClip,
  type EditProject,
  type EditTextClip,
  type NodeV4Data,
  type NodeV4ScriptShot,
  type NodeWorkflowEdgeV4,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

/**
 * 撤销载荷。多数 op 的 inverse 就是另一条 op；`delete` 例外，它要整份快照。
 * 助手的**一轮 = 一个 undo 条目**（§11.3），所以调用方收集的是一个 `NodeV4Inverse[]`，
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
      /** 这条 op 改到了哪些节点（§11.3 变更高亮的输入）。 */
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
 * 则两条路共用同一次同步、同一份 inverse，撤销自然是**一个条目**（§11.3）。
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

/* ─────────────────────────────────────────────────────────────────────────
 * 剪辑台（S8 · spec §6 / §8.5）
 *
 * ⚠ 五条 op 一个字都不碰 `nodes` / `edges`：时间线是**引用**画布上的卡，不是
 * 复制它们。所以 `changedNodeIds` 报的是「这一段指向谁」（变更高亮据此指回来源
 * 卡），⛔ 不报「改了这张卡」——那张卡确实一个字都没变。
 *
 * ⚠ 时间线不存在时四条单段 op **失败可见**（`editMissing`），⛔ 不就地兜一份空
 * 表：空表要一个名字，而名字是 i18n 的事；在这里编一个英文缺省，用户就会在中文
 * 界面上看到一行英文成片名。调用方（`useEditDesk`）在同一批里先发一条
 * `edit_set_timeline` —— 一批 = 一个撤销条目，撤销仍然一步回到位。
 * ───────────────────────────────────────────────────────────────────────── */

function withEditProject(
  state: NodeWorkflowStateV4,
  project: EditProject | undefined,
): NodeWorkflowStateV4 {
  if (!project) {
    // ⚠ 删 key 而不是写 `edit: undefined`：`undefined` 会被 JSON 序列化成
    // 「这个字段不在」——但**内存里的对象仍然带着这个 key**，`state.edit` 的
    // 存在性判断（op 执行器里那四条 `if (!project)`）因此仍然是 false，只是
    // `'edit' in state` 变成 true。两者不一致的对象迟早会让某处判错。
    const next: Record<string, unknown> = { ...state }
    delete next.edit
    return next as NodeWorkflowStateV4
  }
  return { ...state, edit: project }
}

function withTextTrack(
  project: EditProject,
  clips: readonly EditTextClip[],
): EditProject {
  return {
    ...project,
    tracks: { ...project.tracks, text: [...clips] },
  }
}

function withTrack(
  project: EditProject,
  track: EditTrackId,
  clips: readonly EditClip[],
): EditProject {
  return {
    ...project,
    tracks: { ...project.tracks, [track]: [...clips] },
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 剧本投影（进度表 24 · `project_script`）
 *
 * ⚠ 三类改动写在**同一条 op** 里，因为它们是同一步意图的三面：新增的镜建出来、
 * 文案变了的旧镜标一下、剧本里没了的旧镜压灰。拆成三条 op 的表现是撤销要点三次，
 * 而中间那一次撤完的图谁都没见过。
 *
 * ⚠ inverse **只收本次新增的那几面镜**（spec 原文）：标记过的旧镜上可能挂着用户
 * 已经生成的产物与手改过的提示词，一次撤销不该把那些一并带走。所以撤销之后
 * 「已变 / 标灰」的角标**仍然在** —— 它们说的是「剧本和这一镜对不上」，那句话
 * 在撤销之后依然为真。
 * ───────────────────────────────────────────────────────────────────────── */

function withScriptShotState(
  state: NodeWorkflowStateV4,
  nodeId: string,
  patch: (ref: NodeV4ScriptShot) => NodeV4ScriptShot,
): NodeWorkflowStateV4 {
  return replaceNodeData(state, nodeId, (data) => {
    if (
      data.kind !== NODE_MEDIA_KIND_IDS.video ||
      data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.shot ||
      !data.scriptShot
    ) {
      return data
    }
    return { ...data, scriptShot: patch(data.scriptShot) }
  })
}

function applyScriptProjection(
  state: NodeWorkflowStateV4,
  script: NodeV4,
  plan: ScriptProjectionPlan,
  context: ApplyOpV4Context,
  now: string,
): ApplyOpV4Result {
  let next = state
  const changedNodeIds: string[] = []
  const changedEdgeIds: string[] = []
  const createdIds: string[] = []
  const takenLabels = new Set(
    state.nodes
      .map((node) =>
        node.data.kind === NODE_MEDIA_KIND_IDS.video
          ? node.data.label
          : undefined,
      )
      .filter((label): label is string => label !== undefined),
  )

  for (const shot of plan.toCreate) {
    const id = context.mintId(NODE_MEDIA_KIND_IDS.video)
    let label: string
    try {
      label = buildShotLabel({ given: shot.title }, takenLabels)
    } catch {
      return { ok: false, reason: 'nameExhausted' }
    }
    takenLabels.add(label)
    // ⚠ 新增的镜**追加到末尾**（画板 §3 那句）：⛔ 不按剧本里的编号往中间插 ——
    //   插队会把用户手动归过镜的节点一起挤走，而那不是这条 op 该管的事。
    const shotNo = nextShotNo(next.nodes)
    const scriptShot: NodeV4ScriptShot = {
      scriptNodeId: script.id,
      shotKey: shot.key,
      projectedText: shot.text,
      state: NODE_SCRIPT_SHOT_STATE_IDS.synced,
    }
    const parsed = NodeV4DataSchema.safeParse({
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      name: label,
      label,
      status: 'idle',
      createdAt: now,
      shotNo,
      prompt: shot.text,
      scriptShot,
      // 角色槽只开**空位**（35 未落）：名字来自这一段里的 `@角色`，⛔ 不装填。
      ...(shot.roles.length === 0
        ? {}
        : { referenceSlots: shot.roles.map((role) => ({ role })) }),
      ...(shot.durationSec === undefined
        ? {}
        : { params: { duration: String(shot.durationSec) } }),
    })
    if (!parsed.success) return { ok: false, reason: 'invalidShot' }
    next = {
      ...next,
      nodes: [
        ...next.nodes,
        {
          id,
          position: shotSpawnPosition(next.nodes, next.edges, shotNo),
          data: parsed.data,
        },
      ],
    }
    // 剧本卡 → 这一镜的文本槽（`role: script` = 正文那一档，§9.4）。
    const wired = connectIntoSlot(next, {
      source: script.id,
      target: id,
      slot: NODE_SLOT_IDS.text,
      sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
      edgeId: context.mintId('e'),
      role: NODE_SLOT_TEXT_ROLE_IDS.script,
      now,
    })
    if (!wired.ok) return { ok: false, reason: wired.reason }
    next = wired.state
    changedEdgeIds.push(wired.edgeId)
    createdIds.push(id)
    changedNodeIds.push(id)
  }

  for (const entry of plan.toMark) {
    next = withScriptShotState(next, entry.node.id, (ref) => ({
      ...ref,
      state: NODE_SCRIPT_SHOT_STATE_IDS.changed,
      // ⛔ `projectedText` 不动：它是「上一次同步进来的那一段」，diff 的左边。
      pendingText: entry.shot.text,
    }))
    changedNodeIds.push(entry.node.id)
  }

  for (const node of plan.toResync) {
    const ref = readScriptShotRef(node)
    if (!ref || ref.state === NODE_SCRIPT_SHOT_STATE_IDS.synced) continue
    next = withScriptShotState(next, node.id, (current) => {
      // ⚠ 删 key 而不是写 `pendingText: undefined`（与 `withEditProject` 同一条）：
      // `undefined` 序列化后消失，但内存里那个对象仍然带着这个 key。
      const rest: NodeV4ScriptShot = { ...current }
      delete (rest as { pendingText?: string }).pendingText
      return { ...rest, state: NODE_SCRIPT_SHOT_STATE_IDS.synced }
    })
    changedNodeIds.push(node.id)
  }

  for (const node of plan.toDrop) {
    next = withScriptShotState(next, node.id, (ref) => ({
      ...ref,
      state: NODE_SCRIPT_SHOT_STATE_IDS.dropped,
    }))
    changedNodeIds.push(node.id)
  }

  return {
    ok: true,
    state: next,
    inverse: {
      kind: 'sequence',
      // ⚠ 逆序删：与整份 inverse 的回放顺序同一条规矩。
      items: [...createdIds]
        .reverse()
        .map((nodeId) => ({ kind: 'removeNode', nodeId }) as const),
    },
    changedNodeIds,
    changedEdgeIds,
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
      // `delete` 不自动落（§13.3 就地确认档）。
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
        // 整次换序是**一步**（§11.2）：inverse 也是一条反向 reorder。
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

    case ids.projectScript: {
      const script = resolveTarget(state, op.scriptNodeId, context.refs)
      if (!script) return { ok: false, reason: 'unknownNode' }
      if (
        script.data.kind !== NODE_MEDIA_KIND_IDS.text ||
        script.data.subtype !== NODE_V4_TEXT_SUBTYPE_IDS.script
      ) {
        return { ok: false, reason: 'notScriptNode' }
      }
      const plan = planScriptProjection(
        state.nodes,
        script.id,
        script.data.body,
      )
      if (plan.shots.length === 0) return { ok: false, reason: 'emptyScript' }
      /**
       * ⚠ 投影过的剧本再 `create` **拒并提示**，⛔ 不静默当成重投影：两者的
       * inverse 收的不是同一批 id（重投影只撤回本次新增，create 撤回整排）。
       */
      if (
        op.mode === NODE_SCRIPT_PROJECTION_MODE_IDS.create &&
        plan.projected.length > 0
      ) {
        return { ok: false, reason: 'alreadyProjected' }
      }
      if (
        op.mode === NODE_SCRIPT_PROJECTION_MODE_IDS.reproject &&
        plan.projected.length === 0
      ) {
        return { ok: false, reason: 'notProjected' }
      }
      return applyScriptProjection(state, script, plan, context, now)
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

    case ids.setOutputVersion: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (!isMediaNodeData(node.data)) {
        return { ok: false, reason: 'notAGeneratedNode' }
      }
      const previous = readOutputIndex(node.data)
      const nextData = selectOutputVersion(node.data, op.index)
      // ⚠ 越界**失败可见**：静默钳到最后一版会让「点了第 5 颗小点」看起来成功。
      if (!nextData) return { ok: false, reason: 'unknownOutputVersion' }
      return {
        ok: true,
        state: replaceNodeData(state, node.id, () => nextData),
        inverse: {
          kind: 'op',
          op: { op: ids.setOutputVersion, target: node.id, index: previous },
        },
        changedNodeIds: [node.id],
        changedEdgeIds: [],
      }
    }

    case ids.splitOutputVersion: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      if (!isMediaNodeData(node.data)) {
        return { ok: false, reason: 'notAGeneratedNode' }
      }
      const versions = readOutputVersions(node.data)
      const index = op.index ?? readOutputIndex(node.data)
      const version = versions[index]
      if (!version) return { ok: false, reason: 'unknownOutputVersion' }

      const id = context.mintId(node.data.kind)
      const taken = new Set(state.nodes.map((item) => item.data.name))
      let name: string
      try {
        name = buildStableNodeName(
          {
            kind: node.data.kind,
            subtype: node.data.subtype,
            ...(node.data.shotNo === undefined
              ? {}
              : { shotNo: node.data.shotNo }),
          },
          {
            labelOf: (k, sub) => NODE_V4_SUBTYPE_LABELS[`${k}.${sub}`] ?? sub,
            taken,
          },
        )
      } catch {
        return { ok: false, reason: 'nameExhausted' }
      }

      // ⚠ **非破坏**：原卡的版本表一个字不动。新卡只带这一版，所以它自己的版本
      // 表就是那一条 —— ⛔ 不复制整份，否则拆出来的卡还能切回没拆的那些版本。
      const parsed = NodeV4DataSchema.safeParse({
        kind: node.data.kind,
        subtype: node.data.subtype,
        name,
        status: node.data.status,
        createdAt: now,
        url: version.url,
        ...(node.data.shotNo === undefined ? {} : { shotNo: node.data.shotNo }),
        ...(version.generationId ? { generationId: version.generationId } : {}),
        ...(version.prompt ? { prompt: version.prompt } : {}),
        ...(version.model ? { model: version.model } : {}),
        ...(version.meta ?? {}),
        outputs: { versions: [version], cur: 0 },
      })
      if (!parsed.success) return { ok: false, reason: 'invalidSubtype' }

      const spawned: NodeV4 = {
        id,
        position: {
          x: node.position.x + NODE_V4_OUTPUT_VERSION.splitOffset,
          y: node.position.y + NODE_V4_OUTPUT_VERSION.splitOffset,
        },
        data: parsed.data,
      }
      return {
        ok: true,
        state: { ...state, nodes: [...state.nodes, spawned] },
        inverse: { kind: 'removeNode', nodeId: id },
        changedNodeIds: [id],
        changedEdgeIds: [],
      }
    }

    case ids.setSubtype: {
      const node = resolveTarget(state, op.target, context.refs)
      if (!node) return { ok: false, reason: 'unknownNode' }
      // ⛔ 只有 image kind 有子型可换：video 的子型决定的是完全不同的槽位形状，
      // 换它等于换一张卡，那是 delete + add_node 而不是这条。
      if (node.data.kind !== NODE_MEDIA_KIND_IDS.image) {
        return { ok: false, reason: 'notAnImageNode' }
      }
      const previous = node.data.subtype
      if (previous === op.subtype) return { ok: false, reason: 'noChange' }
      const parsed = NodeV4DataSchema.safeParse({
        ...node.data,
        subtype: op.subtype,
      })
      if (!parsed.success) return { ok: false, reason: 'invalidSubtype' }
      return {
        ok: true,
        state: replaceNodeData(state, node.id, () => parsed.data),
        inverse: {
          kind: 'op',
          op: { op: ids.setSubtype, target: node.id, subtype: previous },
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
      // 直接写字段会让名字和镜号对不上（§10 末条）。
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

    /* ── 剪辑台五条（S8）──────────────────────────────────────────── */

    case ids.editSetTimeline: {
      return {
        ok: true,
        state: withEditProject(state, op.project),
        inverse: {
          kind: 'op',
          op: {
            op: ids.editSetTimeline,
            ...(state.edit ? { project: state.edit } : {}),
          },
        },
        changedNodeIds: [],
        changedEdgeIds: [],
      }
    }

    case ids.editAddClip: {
      const project = state.edit
      if (!project) return { ok: false, reason: 'editMissing' }
      const track = op.track as EditTrackId
      const clips = project.tracks[track]
      if (clips.some((clip) => clip.id === op.clip.id)) {
        return { ok: false, reason: 'duplicateClip' }
      }
      const next = insertClip(clips, op.clip, op.index)
      if (next === clips) return { ok: false, reason: 'trackFull' }
      return {
        ok: true,
        state: withEditProject(state, withTrack(project, track, next)),
        inverse: {
          kind: 'op',
          op: { op: ids.editRemoveClip, track: op.track, clipId: op.clip.id },
        },
        changedNodeIds: [op.clip.sourceNodeId],
        changedEdgeIds: [],
      }
    }

    case ids.editRemoveClip: {
      const project = state.edit
      if (!project) return { ok: false, reason: 'editMissing' }
      const track = op.track as EditTrackId
      const clips = project.tracks[track]
      const index = clips.findIndex((clip) => clip.id === op.clipId)
      const removed = index < 0 ? undefined : clips[index]
      if (!removed) return { ok: false, reason: 'unknownClip' }
      return {
        ok: true,
        state: withEditProject(
          state,
          withTrack(project, track, removeClipFromTrack(clips, op.clipId)),
        ),
        // ⚠ inverse 要带**位置**：删中间一段之后撤销，段必须回到原位而不是排到队尾。
        inverse: {
          kind: 'op',
          op: {
            op: ids.editAddClip,
            track: op.track,
            clip: removed,
            index,
          },
        },
        changedNodeIds: [removed.sourceNodeId],
        changedEdgeIds: [],
      }
    }

    case ids.editUpdateClip: {
      const project = state.edit
      if (!project) return { ok: false, reason: 'editMissing' }
      const track = op.track as EditTrackId
      const clips = project.tracks[track]
      const current = clips.find((clip) => clip.id === op.clipId)
      if (!current) return { ok: false, reason: 'unknownClip' }

      // 裁剪两端一起过守卫：`in >= out` 落下去是一段零帧，与合成节点时代
      // 拒收 `start >= end` 是同一条纪律。
      const trimmed =
        op.patch.in === undefined && op.patch.out === undefined
          ? { in: current.in, out: current.out }
          : clampTrim(current, {
              ...(op.patch.in === undefined ? {} : { in: op.patch.in }),
              ...(op.patch.out === undefined ? {} : { out: op.patch.out }),
            })

      const next: EditClip = {
        ...current,
        in: trimmed.in,
        out: trimmed.out,
        ...(op.patch.speed === undefined ? {} : { speed: op.patch.speed }),
        ...(op.patch.muted === undefined ? {} : { muted: op.patch.muted }),
        ...(op.patch.transitionOut === undefined
          ? {}
          : { transitionOut: op.patch.transitionOut }),
        ...(op.patch.gain === undefined ? {} : { gain: op.patch.gain }),
        ...(op.patch.sourceVersionId === undefined
          ? {}
          : { sourceVersionId: op.patch.sourceVersionId }),
      }

      // inverse 只回**这次动过的那几项**（见 op schema 头注：整段快照会把用户
      // 在别处改的也一起退回）。
      const inversePatch = {
        ...(op.patch.in === undefined ? {} : { in: current.in }),
        ...(op.patch.out === undefined ? {} : { out: current.out }),
        ...(op.patch.speed === undefined ? {} : { speed: current.speed }),
        ...(op.patch.muted === undefined ? {} : { muted: current.muted }),
        ...(op.patch.transitionOut === undefined
          ? {}
          : {
              transitionOut: current.transitionOut ?? EDIT_TRANSITION_IDS.none,
            }),
        ...(op.patch.gain === undefined || current.gain === undefined
          ? {}
          : { gain: current.gain }),
        ...(op.patch.sourceVersionId === undefined ||
        current.sourceVersionId === undefined
          ? {}
          : { sourceVersionId: current.sourceVersionId }),
      }

      return {
        ok: true,
        state: withEditProject(
          state,
          withTrack(
            project,
            track,
            clips.map((clip) => (clip.id === op.clipId ? next : clip)),
          ),
        ),
        inverse: {
          kind: 'op',
          op: {
            op: ids.editUpdateClip,
            track: op.track,
            clipId: op.clipId,
            patch: inversePatch,
          },
        },
        changedNodeIds: [current.sourceNodeId],
        changedEdgeIds: [],
      }
    }

    case ids.editMoveClip: {
      const project = state.edit
      if (!project) return { ok: false, reason: 'editMissing' }
      const track = op.track as EditTrackId
      const clips = project.tracks[track]
      const from = clips.findIndex((clip) => clip.id === op.clipId)
      const moved = from < 0 ? undefined : clips[from]
      if (!moved) return { ok: false, reason: 'unknownClip' }
      return {
        ok: true,
        state: withEditProject(
          state,
          withTrack(
            project,
            track,
            moveClipInTrack(clips, op.clipId, op.toIndex),
          ),
        ),
        inverse: {
          kind: 'op',
          op: {
            op: ids.editMoveClip,
            track: op.track,
            clipId: op.clipId,
            toIndex: from,
          },
        },
        changedNodeIds: [moved.sourceNodeId],
        changedEdgeIds: [],
      }
    }

    /* ── 字幕三条（S8d · spec §6「文字段」）─────────────────────────── */

    case ids.editAddText: {
      const project = state.edit
      if (!project) return { ok: false, reason: 'editMissing' }
      const clips = project.tracks.text
      if (clips.some((clip) => clip.id === op.clip.id)) {
        return { ok: false, reason: 'duplicateClip' }
      }
      if (clips.length >= EDIT_TRACK_MAX_CLIPS) {
        return { ok: false, reason: 'trackFull' }
      }
      return {
        ok: true,
        state: withEditProject(
          state,
          withTextTrack(project, [...clips, clampTextClip(op.clip)]),
        ),
        inverse: {
          kind: 'op',
          op: { op: ids.editRemoveText, clipId: op.clip.id },
        },
        // ⚠ 字幕不指向任何一张卡 —— 没有「哪张卡变了」可报。
        changedNodeIds: [],
        changedEdgeIds: [],
      }
    }

    case ids.editRemoveText: {
      const project = state.edit
      if (!project) return { ok: false, reason: 'editMissing' }
      const clips = project.tracks.text
      const removed = clips.find((clip) => clip.id === op.clipId)
      if (!removed) return { ok: false, reason: 'unknownClip' }
      return {
        ok: true,
        state: withEditProject(
          state,
          withTextTrack(
            project,
            clips.filter((clip) => clip.id !== op.clipId),
          ),
        ),
        // ⚠ T 轨的位置是段自己的 `startSec`，所以 inverse 不必带下标（与 V 轨
        // 那条「删中间一段要记位置」是两种形状，见 `EDIT_TEXT_TRACK_ID` 头注）。
        inverse: { kind: 'op', op: { op: ids.editAddText, clip: removed } },
        changedNodeIds: [],
        changedEdgeIds: [],
      }
    }

    case ids.editUpdateText: {
      const project = state.edit
      if (!project) return { ok: false, reason: 'editMissing' }
      const clips = project.tracks.text
      const current = clips.find((clip) => clip.id === op.clipId)
      if (!current) return { ok: false, reason: 'unknownClip' }

      const next = clampTextClip({
        ...current,
        ...(op.patch.text === undefined ? {} : { text: op.patch.text }),
        ...(op.patch.startSec === undefined
          ? {}
          : { startSec: op.patch.startSec }),
        ...(op.patch.durationSec === undefined
          ? {}
          : { durationSec: op.patch.durationSec }),
        ...(op.patch.anchor === undefined ? {} : { anchor: op.patch.anchor }),
        ...(op.patch.size === undefined ? {} : { size: op.patch.size }),
        ...(op.patch.tone === undefined ? {} : { tone: op.patch.tone }),
        ...(op.patch.fadeSec === undefined
          ? {}
          : { fadeSec: op.patch.fadeSec }),
      })

      // inverse 只回**这次动过的那几项**（与 `edit_update_clip` 同一条论据）。
      const inversePatch = {
        ...(op.patch.text === undefined ? {} : { text: current.text }),
        ...(op.patch.startSec === undefined
          ? {}
          : { startSec: current.startSec }),
        ...(op.patch.durationSec === undefined
          ? {}
          : { durationSec: current.durationSec }),
        ...(op.patch.anchor === undefined ? {} : { anchor: current.anchor }),
        ...(op.patch.size === undefined ? {} : { size: current.size }),
        ...(op.patch.tone === undefined ? {} : { tone: current.tone }),
        ...(op.patch.fadeSec === undefined ? {} : { fadeSec: current.fadeSec }),
      }

      return {
        ok: true,
        state: withEditProject(
          state,
          withTextTrack(
            project,
            clips.map((clip) => (clip.id === op.clipId ? next : clip)),
          ),
        ),
        inverse: {
          kind: 'op',
          op: {
            op: ids.editUpdateText,
            clipId: op.clipId,
            patch: inversePatch,
          },
        },
        changedNodeIds: [],
        changedEdgeIds: [],
      }
    }

    default:
      return NOT_HANDLED
  }
}

/**
 * 撤销一条 op（§11.3）。助手的一轮 = 一个 undo 条目，所以调用方拿到 `NodeV4Inverse[]`
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
