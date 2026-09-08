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
 *   · 模型 → `useWorkflowModelOptions` 给的那张表 + `isRunnableModelOption`
 *     （选择器判「这条渠道现在能不能跑」用的同一个谓词）
 *   · 档位 → `getVideoModelParameterOptions`（「支不支持」+「有哪些档」两问合一
 *     的那一处，账本 X4）
 *   · 参考图 → `resolveReferenceAssetLimit` + 按 URL 判重，与名册卡落卡那两道闸
 *     同源，连拒绝词表都用连线那套（`duplicate` / `capacityFull`）
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
  NODE_ASSISTANT_OP_V4_GROUP_IDS,
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_OP_V4_SPECS,
  NODE_ASSISTANT_OP_V4_TIER_IDS,
} from '@/constants/node-assistant-ops'
import { NODE_MEDIA_KIND_IDS, NODE_STATUS_IDS } from '@/constants/node-types'
import {
  evaluateV4Ingest,
  previewV4SlotCapacity,
} from '@/hooks/node/use-cast-ingest-v4'
import type { NodeSlotId } from '@/constants/node-slots'
import {
  NODE_CONNECT_REJECT_REASON_IDS,
  type NodeConnectRejectReason,
} from '@/lib/node-connection-rules'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'

/**
 * 一次提案里一条 op 的裁决（③e）。
 *
 * ⚠ 形状与 v3 那份同构（`index` / `status` / `reason`），但**理由词表是 v4 的**
 * ——两套词表不是同义词，见 `PlannedV4Connect` 的头注。
 */
export interface PlannedNodeAssistantOpV4 {
  /** 在原提案里的下标 —— 卡上按这个顺序显示，执行也按这个顺序。 */
  readonly index: number
  readonly op: NodeAssistantOpV4
  readonly status: 'ready' | 'rejected'
  /**
   * 这条写入会盖掉用户手写的内容，必须走就地三选（brief §5 第二档）。
   *
   * ⚠ 判据在规划器算一次、卡与 dock 都读它，⛔ 两边各判各的：dock 决定「进不进
   * 自动落」、卡决定「出不出三选」，同一个问题两个答案会让一条 op 既自动落了、
   * 卡上又还在问你要不要覆盖。
   */
  readonly requiresChoice?: boolean
  readonly reason?: NodeConnectRejectReason
  /** 只有 `slotFull` 会带，用来显示「参考位 n/m」。 */
  readonly capacity?: { readonly current: number; readonly limit: number }
}

/* ═════════════════════════════════════════════════════════════════════════
 * ⚠ v3 规划器（`planNodeAssistantOps` + `createPendingNode`）已于 C3c-③d-4 删除。
 *
 * 它的连线合法性问的是 `evaluateCastIngest`：v3 一节点一入口，答案是 yes/no。
 * 画布翻到 v4 之后目标节点有**多个具名口**，那个问题本身失去了对象 —— 留着它只
 * 会让助手在 v4 图上永远拿到 v3 的答案（恒真），一批连线全放行、执行时再一条条
 * 失败。上面的类型（`PlannedNodeAssistantOp` / `NodeAssistantOpPlan`）保留：它们
 * 描述的是「这一批 op 的裁决」这件事本身，与图的版本无关，v4 规划器（③e）复用
 * 同一组形状。下面的 `planV4Connect` 是它在 v4 里的对应物。
 * ═════════════════════════════════════════════════════════════════════════ */

/* ═════════════════════════════════════════════════════════════════════════
 * v4 分支（第三期 · 画布）
 *
 * ⚠ ③d-4 已删掉上面那条 v3 分支
 * （`planNodeAssistantOps` 与它依赖的 `evaluateCastIngest` / `createPendingNode`）。
 *
 * ── 为什么必须另起一条而不是给旧的加参数 ────────────────────────────────
 * 旧分支的连线合法性问的是 `evaluateCastIngest`：v3 的一节点一入口，答案是
 * yes/no。v4 的目标有**多个具名口**，`connect` 载荷里带的正是那个 `slot`，所以
 * 问题从「能不能连」变成「这个口现在收不收」。同一个函数回答不了两个问题 ——
 * 硬塞的结果是助手在 v4 图上永远拿到 v3 的答案（恒真），一批连线全放行、执行时
 * 再一条条失败，用户看到的是「说落好了但图是散的」（台账 K-2 那一幕）。
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * 一条 v4 连线提案的裁决。`capacity` 只有满档时带（显示 `n/m`）。
 *
 * ⚠ 理由词表是 **v4 那一份**（`NodeConnectRejectReason`），⛔ 不复用 v3 的
 * `NodeStudioIngestRejectReason`：两者不是同义词（v4 的 `slotFull` 说的是「这个
 * **口**满了」，v3 的 `capacityFull` 说的是「参考位满了」——v3 只有一个口，所以
 * 它从来不需要区分是哪个）。文案键 `StudioNode.v4.connectRejected.*` 已按 v4 词表
 * 逐条存在。
 */
export interface PlannedV4Connect {
  readonly status: 'ready' | 'rejected'
  readonly slot: NodeSlotId
  readonly reason?: NodeConnectRejectReason
  readonly capacity?: { readonly current: number; readonly limit: number }
}

/**
 * 一条 v4 `connect` / `attach_asset` 能不能落。
 *
 * ⚠ 判据走 `evaluateV4Ingest` —— 与**拖拽落槽**、与**端口点亮**是同一个函数。
 * 助手和人手因此永远拿到同一个答案，⛔ 不在这里自己重写一遍端口表。
 */
export function planV4Connect(
  source: NodeV4,
  target: NodeV4,
  slot: NodeSlotId,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
): PlannedV4Connect {
  const evaluation = evaluateV4Ingest(
    source,
    target,
    edges,
    nodes,
    capacityBySlot,
  )
  if (evaluation.slots.includes(slot)) return { status: 'ready', slot }

  const capacity = previewV4SlotCapacity(target, slot, edges, capacityBySlot)
  // 这个口存在但没亮：多半是满了 —— 把 `n/m` 一并带上，卡上显示「参考位 3/3」
  // 比一句「不能连」有用得多。
  const full = capacity !== null && capacity.current >= capacity.limit
  const reason: NodeConnectRejectReason = full
    ? NODE_CONNECT_REJECT_REASON_IDS.slotFull
    : (evaluation.reason ?? NODE_CONNECT_REJECT_REASON_IDS.kindNotAllowed)
  return {
    status: 'rejected',
    slot,
    reason,
    ...(full && capacity ? { capacity } : {}),
  }
}

/**
 * 一次提案的裁决（③e）。
 *
 * ── 为什么读类 op 不进这张表 ──────────────────────────────────────────
 * `read_canvas` / `find_node` 没有副作用：它们既不改图也不花钱，摆在审批卡上只会
 * 让用户去批准一件根本不会发生的事。执行器对它们返回 `handled: false`，这里同源
 * 地把它们滤掉，⛔ 不是「显示成已跳过」——那会让一张两条真 op 的卡看起来有五条。
 */
export interface NodeAssistantOpPlanV4 {
  readonly ops: readonly PlannedNodeAssistantOpV4[]
  /** 自动落的那一批（免费、算得出 inverse、且不覆盖用户手写内容）。 */
  readonly autoApplyCount: number
  /** 要用户就地确认的（`delete` 那一档 + 会覆盖手写内容的写入）。 */
  readonly confirmCount: number
  /** 会扣 credit 的。审批上必须单独确认。 */
  readonly generateCount: number
  readonly rejectedCount: number
}

/** 规划期给本批新节点的占位 id。只活在这一次规划里，⛔ 绝不进图。 */
const PENDING_NODE_ID_PREFIX = 'canvas-op-pending:'

function readExistingText(node: NodeV4 | undefined): string {
  if (!node) return ''
  return (
    (node.data.kind === NODE_MEDIA_KIND_IDS.text
      ? node.data.body
      : node.data.prompt) ?? ''
  ).trim()
}

/**
 * 这条内容 op 会不会**盖掉用户已经写下的字**（brief §5 第二档）。
 *
 * ⚠ 判据是「目标里现在有没有字」而不是「模型给的 mode 是什么」：模型一律会写
 * `replace`（它不知道那里有东西），把决定权交给它等于取消这道门。空字段直接落，
 * 非空才问 —— 三选（追加 / 覆盖 / 保留）由卡给。
 */
function overwritesHandwrittenText(
  op: NodeAssistantOpV4,
  node: NodeV4 | undefined,
): boolean {
  if (
    op.op !== NODE_ASSISTANT_OP_V4_IDS.setText &&
    op.op !== NODE_ASSISTANT_OP_V4_IDS.setPrompt
  ) {
    return false
  }
  return op.mode === 'replace' && readExistingText(node).length > 0
}

/**
 * 一批 v4 op → 「哪些能做、哪些不能以及为什么」。
 *
 * ── 为什么要在一份模拟图上推进 ────────────────────────────────────────
 * 一次提案里「新建角色 → 连到镜头」是常态，而新节点在规划时还没有 id。所以
 * `add_node` 先在模拟图上落一个占位节点，后面的 `connect` 就能被 `planV4Connect`
 * 真正校验（槽收不收、满没满都算得准），而不是碰到新节点就跳过检查 —— 跳过的
 * 结果是一批连线全放行、执行时再一条条失败（台账 K-2 那一幕）。
 */
export function planNodeAssistantOpsV4(
  batch: readonly NodeAssistantOpV4[],
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
): NodeAssistantOpPlanV4 {
  const simulated: NodeV4[] = [...nodes]
  const refToId = new Map<string, string>()
  const planned: PlannedNodeAssistantOpV4[] = []

  const resolve = (reference: string): NodeV4 | undefined => {
    const id = refToId.get(reference) ?? reference
    return simulated.find((node) => node.id === id)
  }

  batch.forEach((op, index) => {
    const spec = NODE_ASSISTANT_OP_V4_SPECS[op.op]
    if (spec.group === NODE_ASSISTANT_OP_V4_GROUP_IDS.read) return

    const reject = (reason: NodeConnectRejectReason) => {
      planned.push({ index, op, status: 'rejected', reason })
    }

    if (op.op === NODE_ASSISTANT_OP_V4_IDS.addNode) {
      const id = `${PENDING_NODE_ID_PREFIX}${index}`
      if (op.ref) refToId.set(op.ref, id)
      simulated.push({
        id,
        position: op.position ?? { x: 0, y: 0 },
        data: buildPendingNodeData(op),
      })
      planned.push({ index, op, status: 'ready' })
      return
    }

    if (
      op.op === NODE_ASSISTANT_OP_V4_IDS.connect ||
      op.op === NODE_ASSISTANT_OP_V4_IDS.attachAsset
    ) {
      const sourceRef =
        op.op === NODE_ASSISTANT_OP_V4_IDS.connect ? op.source : op.sourceNodeId
      const source = resolve(sourceRef)
      const target = resolve(op.target)
      if (!source || !target) {
        reject(NODE_CONNECT_REJECT_REASON_IDS.unknownNode)
        return
      }
      const verdict = planV4Connect(
        source,
        target,
        op.slot,
        edges,
        simulated,
        capacityBySlot,
      )
      planned.push({
        index,
        op,
        status: verdict.status,
        ...(verdict.reason ? { reason: verdict.reason } : {}),
        ...(verdict.capacity ? { capacity: verdict.capacity } : {}),
      })
      return
    }

    if (op.op === NODE_ASSISTANT_OP_V4_IDS.disconnect) {
      const exists = edges.some((edge) => edge.id === op.edgeId)
      planned.push(
        exists
          ? { index, op, status: 'ready' }
          : {
              index,
              op,
              status: 'rejected',
              reason: NODE_CONNECT_REJECT_REASON_IDS.unknownNode,
            },
      )
      return
    }

    if (op.op === NODE_ASSISTANT_OP_V4_IDS.reorderShot) {
      planned.push({ index, op, status: 'ready' })
      return
    }

    // 剩下的都有一个 `target`：找不到就拒，⛔ 不静默跳过（用户读不出少了什么）。
    const target = resolve(readOpTarget(op))
    if (!target) {
      reject(NODE_CONNECT_REJECT_REASON_IDS.unknownNode)
      return
    }
    planned.push({ index, op, status: 'ready' })
  })

  let autoApplyCount = 0
  let confirmCount = 0
  let generateCount = 0
  let rejectedCount = 0
  const ops: PlannedNodeAssistantOpV4[] = planned.map((entry) => {
    if (entry.status === 'rejected') {
      rejectedCount += 1
      return entry
    }
    const spec = NODE_ASSISTANT_OP_V4_SPECS[entry.op.op]
    if (spec.tier === NODE_ASSISTANT_OP_V4_TIER_IDS.hardConfirm) {
      generateCount += 1
      return entry
    }
    const target = readOpTarget(entry.op)
    const requiresChoice =
      target !== '' && overwritesHandwrittenText(entry.op, resolve(target))
    if (spec.tier === NODE_ASSISTANT_OP_V4_TIER_IDS.confirm || requiresChoice) {
      confirmCount += 1
      return requiresChoice ? { ...entry, requiresChoice } : entry
    }
    autoApplyCount += 1
    return entry
  })

  return {
    ops,
    autoApplyCount,
    confirmCount,
    generateCount,
    rejectedCount,
  }
}

/** 一条 op 指着谁。没有 `target` 的（`disconnect` / `reorder_shot`）返回空串。 */
function readOpTarget(op: NodeAssistantOpV4): string {
  return 'target' in op && typeof op.target === 'string' ? op.target : ''
}

/**
 * 一条 `add_node` 在模拟图上的占位数据。
 *
 * ⚠ 只填**判连线要用到的**那几样（kind / subtype / name / shotNo）：端口表问的
 * 就是这两个。⛔ 不在这里造一份「像真的一样」的完整 data —— 真数据由执行器建，
 * 这里多写一个字段就是多一处会与它分叉的规则。
 */
function buildPendingNodeData(op: {
  readonly kind: NodeV4['data']['kind']
  readonly subtype: string
  readonly name?: string
  readonly shotNo?: number
}): NodeV4['data'] {
  const base = {
    kind: op.kind,
    subtype: op.subtype,
    name: op.name ?? op.subtype,
    status: NODE_STATUS_IDS.idle,
    createdAt: '',
    ...(op.shotNo === undefined ? {} : { shotNo: op.shotNo }),
  }
  return (
    op.kind === NODE_MEDIA_KIND_IDS.text ? { ...base, body: '' } : base
  ) as NodeV4['data']
}
