/**
 * `@` 引用 → 槽绑定（spec §1.7 / §8.2）。**纯函数**：不碰 DOM、不发请求、不读时钟。
 *
 * ── 这一层回答什么 ────────────────────────────────────────────────────
 * S0 的 `parseMentions` 只把一行字切成段；这里把每一段 mention 翻译成
 * `{sourceNodeId, slot}`，再与**当前边表**对账，产出一份 diff：
 *   · `toConnect`    正文里新写出来的 @ —— 还没有对应的边
 *   · `toDisconnect` 正文里被退格删掉的 @ —— 边还在，但已经没有 @ 指着它
 *   · `rejected`     解析得出但落不下去的（容量满 / 槽不收这个 kind / 自环 …），
 *                    理由用 `NodeConnectRejectReason`，⛔ 不静默丢掉
 *
 * ── 三条纪律 ──────────────────────────────────────────────────────────
 * 1. **落槽合法性只有一份**：这里判 kind / 容量走的是 `canConnect` +
 *    `planSlotConnectRole`，与拖入（`planV4IngestDrop`）、连线（`connect` op）
 *    同一批函数。⛔ 不在这里现推端口表。
 * 2. **只断自己建的边**：`toDisconnect` 只看 `data.via === 'mention'` 的边。
 *    手拖进来的首帧不该因为正文里没写 @ 就被删掉。
 * 3. **一个 @ 一条边**：正文里同一个来源 + 同一个槽写两次，只当一次
 *    （chip 是引用不是计数）。
 */

import {
  NODE_SLOT_IDS,
  getNodeV4Ports,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import {
  parseMentions,
  type MentionSegmentMention,
} from '@/components/business/node/nodes/v4/chrome/parse-mentions'
import {
  canConnect,
  NODE_CONNECT_REJECT_REASON_IDS,
  type NodeConnectRejectReason,
} from '@/lib/node-connection-rules'
import {
  planSlotConnectRole,
  toConnectionEndpoint,
} from '@/lib/node-slot-binding'
import type {
  NodeV4,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/**
 * 角色卡的最小引用。⚠ 卡本身住在库里（`ContextCard`），**不在图 state 里**，
 * 所以名字要调用方给；卡绑的图 / 音色则从图上反查（`data.contextCardId`）——
 * ⛔ 不让这个纯函数去查库。
 */
export interface MentionCastCardRef {
  readonly id: string
  readonly name: string
}

export interface ResolveMentionsOptions {
  /** 画布上可被 @ 的角色卡。不给 = 正文里只认节点名。 */
  readonly castCards?: readonly MentionCastCardRef[]
  /** 模型给的动态槽上限（`0..N` 的槽跟模型走）。 */
  readonly capacityBySlot?: Partial<Record<NodeSlotId, number>>
}

/** 一个 @ 解析成功之后的落点。 */
export interface MentionSlotBinding {
  readonly sourceNodeId: string
  readonly slot: NodeSlotId
  /** 正文里的原串（含 `@` 与角色前缀）——退格整体删除删的就是它。 */
  readonly raw: string
  readonly name: string
  readonly start: number
  readonly end: number
  /** 显式写了 `@首帧` / `@语音` 这类前缀。 */
  readonly explicitRole: boolean
  /** 画布上有重名（最长匹配之后仍然撞名）——取了图里靠前的那个。 */
  readonly ambiguous?: boolean
}

export interface MentionSlotRejection {
  readonly raw: string
  readonly name: string
  readonly start: number
  readonly end: number
  readonly sourceNodeId?: string
  readonly slot?: NodeSlotId
  readonly reason: NodeConnectRejectReason
}

export interface MentionConnectPlan {
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly slot: NodeSlotId
}

export interface MentionDisconnectPlan {
  readonly edgeId: string
  readonly sourceNodeId: string
  readonly slot: NodeSlotId
}

export interface MentionSlotDiff {
  /** 正文当前**应该**成立的全部绑定（已落的 + 待落的）。 */
  readonly bindings: readonly MentionSlotBinding[]
  readonly toConnect: readonly MentionConnectPlan[]
  readonly toDisconnect: readonly MentionDisconnectPlan[]
  readonly rejected: readonly MentionSlotRejection[]
}

const EMPTY_DIFF: MentionSlotDiff = {
  bindings: [],
  toConnect: [],
  toDisconnect: [],
  rejected: [],
}

/**
 * 无角色前缀时按**来源 kind** 落的默认槽（§8.2「无角色 = 参考」的展开）。
 * 图 / 视频 → 参考、语音 → 语音、文本 → 文本。
 */
const DEFAULT_SLOT_BY_KIND: Readonly<
  Record<NodeWorkflowMediaKind, NodeSlotId>
> = {
  [NODE_MEDIA_KIND_IDS.image]: NODE_SLOT_IDS.reference,
  [NODE_MEDIA_KIND_IDS.video]: NODE_SLOT_IDS.reference,
  [NODE_MEDIA_KIND_IDS.audio]: NODE_SLOT_IDS.voice,
  [NODE_MEDIA_KIND_IDS.text]: NODE_SLOT_IDS.text,
}

/**
 * 这个来源在这个目标上落哪个槽。
 *
 * 首选是上表；首选口不存在时**只在「恰好一个口收这个 kind」时**回落到那个口
 * （文本节点的 `source`、音色节点的 `timbre`、合并节点的 `clip` 都是这种）。
 * ⛔ 多个口都收得下而首选口又不存在时不挑 —— 端口表的顺序是版式顺序不是优先级
 * （`planV4IngestDrop` 头注的同一条），那种情况交给拖入的「点亮候选让用户挑」。
 */
export function defaultMentionSlot(
  sourceKind: NodeWorkflowMediaKind,
  target: NodeV4,
): NodeSlotId | undefined {
  const ports = getNodeV4Ports(target.data.kind, target.data.subtype)
  if (!ports) return undefined
  const preferred = DEFAULT_SLOT_BY_KIND[sourceKind]
  const hit = ports.inputs.find(
    (spec) => spec.slot === preferred && spec.sourceKinds.includes(sourceKind),
  )
  if (hit) return hit.slot
  const accepting = ports.inputs.filter((spec) =>
    spec.sourceKinds.includes(sourceKind),
  )
  return accepting.length === 1 ? accepting[0]?.slot : undefined
}

interface NameHit {
  readonly nodeId?: string
  readonly cardId?: string
  readonly ambiguous: boolean
}

/**
 * 可被 @ 的名字表。节点名优先于角色卡名（同名时节点赢：正文里 @ 的多半是画布上
 * 那张卡），同类里先出现的赢并标 `ambiguous`。
 */
function buildNameTable(
  state: NodeWorkflowStateV4,
  castCards: readonly MentionCastCardRef[],
): Map<string, NameHit> {
  const table = new Map<string, NameHit>()
  for (const node of state.nodes) {
    const name = node.data.name
    const existing = table.get(name)
    if (existing) {
      table.set(name, { ...existing, ambiguous: true })
      continue
    }
    table.set(name, { nodeId: node.id, ambiguous: false })
  }
  for (const card of castCards) {
    const existing = table.get(card.name)
    if (existing) {
      table.set(card.name, { ...existing, ambiguous: true })
      continue
    }
    table.set(card.name, { cardId: card.id, ambiguous: false })
  }
  return table
}

/**
 * 角色卡绑的图 / 音色。
 *
 * 卡在图上的落点是**那张角色图**（`image.character.contextCardId`，C1 契约修正 3）；
 * 卡的音色则是挂在这张角色图 `voice` 槽上的音频节点 —— 与「voice → 角色 → 镜头」
 * 那一跳同一条链，⛔ 不在角色卡上另存一个音色 id。
 */
function resolveCastCardSource(
  state: NodeWorkflowStateV4,
  cardId: string,
  slotRole: NodeSlotId,
): NodeV4 | undefined {
  const card = state.nodes.find(
    (node) =>
      node.data.kind === NODE_MEDIA_KIND_IDS.image &&
      node.data.contextCardId === cardId,
  )
  if (!card) return undefined
  if (slotRole !== NODE_SLOT_IDS.voice) return card
  const voiceEdge = state.edges.find(
    (edge) => edge.target === card.id && edge.slot === NODE_SLOT_IDS.voice,
  )
  const voice = voiceEdge
    ? state.nodes.find((node) => node.id === voiceEdge.source)
    : undefined
  return voice ?? card
}

function rejectionOf(
  mention: MentionSegmentMention,
  reason: NodeConnectRejectReason,
  extra: { sourceNodeId?: string; slot?: NodeSlotId } = {},
): MentionSlotRejection {
  return {
    raw: mention.raw,
    name: mention.name,
    start: mention.start,
    end: mention.end,
    reason,
    ...(extra.sourceNodeId ? { sourceNodeId: extra.sourceNodeId } : {}),
    ...(extra.slot ? { slot: extra.slot } : {}),
  }
}

/**
 * 正文里的 `@` → 这个节点各槽应有的边，与当前边表对账出 diff。
 *
 * `text` 是**待落地的正文**（`set_text` / `set_prompt` 写完之后那一份），⛔ 不从
 * `state` 里读——op 执行器调它时 state 上的正文可能还是旧的。
 */
export function resolveMentionsToSlots(
  state: NodeWorkflowStateV4,
  nodeId: string,
  text: string,
  options: ResolveMentionsOptions = {},
): MentionSlotDiff {
  const target = state.nodes.find((node) => node.id === nodeId)
  if (!target) return EMPTY_DIFF

  const castCards = options.castCards ?? []
  const nameTable = buildNameTable(state, castCards)
  const segments = parseMentions(text, { names: [...nameTable.keys()] })

  const bindings: MentionSlotBinding[] = []
  const rejected: MentionSlotRejection[] = []
  const seen = new Set<string>()

  /** 已存在的边（本轮不会被断的那些）+ 本轮打算新建的合成边。 */
  const mentionEdges = state.edges.filter(
    (edge) => edge.target === nodeId && edge.data?.via === 'mention',
  )
  const keptEdgeIds = new Set<string>()
  const toConnect: MentionConnectPlan[] = []
  let workingEdges: NodeWorkflowEdgeV4[] = [...state.edges]

  for (const segment of segments) {
    if (segment.type !== 'mention') continue
    const hit = nameTable.get(segment.name)
    if (!hit) {
      rejected.push(
        rejectionOf(segment, NODE_CONNECT_REJECT_REASON_IDS.unknownNode),
      )
      continue
    }

    const source = hit.nodeId
      ? state.nodes.find((node) => node.id === hit.nodeId)
      : hit.cardId
        ? resolveCastCardSource(state, hit.cardId, segment.role)
        : undefined
    if (!source) {
      rejected.push(
        rejectionOf(segment, NODE_CONNECT_REJECT_REASON_IDS.unknownNode),
      )
      continue
    }

    const slot = segment.explicitRole
      ? segment.role
      : defaultMentionSlot(source.data.kind, target)
    if (!slot) {
      rejected.push(
        rejectionOf(segment, NODE_CONNECT_REJECT_REASON_IDS.unknownSlot, {
          sourceNodeId: source.id,
        }),
      )
      continue
    }

    const key = `${source.id}::${slot}`
    if (seen.has(key)) continue

    // 已经有一条边了（@ 建的或手连的都算）——正文与图已经一致，不必再连。
    const existing = state.edges.find(
      (edge) =>
        edge.target === nodeId &&
        edge.source === source.id &&
        edge.slot === slot,
    )
    if (existing) {
      seen.add(key)
      keptEdgeIds.add(existing.id)
      bindings.push({
        sourceNodeId: source.id,
        slot,
        raw: segment.raw,
        name: segment.name,
        start: segment.start,
        end: segment.end,
        explicitRole: segment.explicitRole,
        ...(hit.ambiguous ? { ambiguous: true } : {}),
      })
      continue
    }

    const plan = planSlotConnectRole(
      source,
      target,
      slot,
      workingEdges,
      state.nodes,
    )
    const verdict = canConnect(
      toConnectionEndpoint(source),
      toConnectionEndpoint(target),
      {
        slot,
        occupancy: plan.occupancy,
        ...(plan.role ? { role: plan.role } : {}),
        ...(options.capacityBySlot?.[slot] === undefined
          ? {}
          : { capacity: options.capacityBySlot[slot] }),
      },
    )
    if (!verdict.ok) {
      rejected.push(
        rejectionOf(segment, verdict.reason, {
          sourceNodeId: source.id,
          slot,
        }),
      )
      continue
    }

    seen.add(key)
    toConnect.push({ sourceNodeId: source.id, targetNodeId: nodeId, slot })
    // 合成边只为让后面的 @ 看到真实占用（容量判据），⛔ 不进任何 state。
    workingEdges = [
      ...workingEdges,
      {
        id: `mention-pending-${toConnect.length}`,
        source: source.id,
        sourceHandle: 'out',
        target: nodeId,
        slot,
      },
    ]
    bindings.push({
      sourceNodeId: source.id,
      slot,
      raw: segment.raw,
      name: segment.name,
      start: segment.start,
      end: segment.end,
      explicitRole: segment.explicitRole,
      ...(hit.ambiguous ? { ambiguous: true } : {}),
    })
  }

  // 退格删 @ 即断槽：只断 @ 建的边，且只断正文里已经没人指着的那些。
  const toDisconnect: MentionDisconnectPlan[] = mentionEdges
    .filter((edge) => !keptEdgeIds.has(edge.id))
    .map((edge) => ({
      edgeId: edge.id,
      sourceNodeId: edge.source,
      slot: edge.slot,
    }))

  return { bindings, toConnect, toDisconnect, rejected }
}

/**
 * 手拆边之后把正文里对应的 `@` chip **整体删掉**（spec §8.2 反向）。
 *
 * ── 为什么是「删 chip」而不是「去掉角色前缀」──────────────────────────
 * 去掉前缀只是把 `@首帧 S02` 降级成 `@S02`，而无角色的 @ 仍然会落回 `reference`
 * 槽 —— 用户拆掉一条边，眼看着它换个槽又长回来。那正是「拆不掉」的观感。所以
 * 拆边 = 删 chip：正文与图重新一致，⛔ 不留一个会自己复活的引用。
 *
 * 返回 `null` = 正文里本来就没有指着这条边的 @（不必改文本）。
 */
export function removeMentionsForSource(
  text: string,
  params: {
    readonly sourceName: string
    readonly slot: NodeSlotId
    readonly names: readonly string[]
  },
): string | null {
  const segments = parseMentions(text, { names: params.names })
  const hits = segments.filter(
    (segment): segment is MentionSegmentMention =>
      segment.type === 'mention' &&
      segment.name === params.sourceName &&
      (segment.explicitRole
        ? segment.role === params.slot
        : // 无角色的 chip 落哪个槽由来源 kind 决定，调用方已经把槽算好传进来，
          // 这里只认「它不是显式的别的角色」。
          true),
  )
  if (hits.length === 0) return null
  let next = text
  // 从后往前删，前面那些 chip 的 start/end 才不会漂。
  for (const hit of [...hits].reverse()) {
    next = `${next.slice(0, hit.start)}${next.slice(hit.end)}`
  }
  return next.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ')
}

/** 正文里可被 @ 的名字表（节点名 + 角色卡名）——调用方拼 `parseMentions` 用。 */
export function listMentionNames(
  state: NodeWorkflowStateV4,
  castCards: readonly MentionCastCardRef[] = [],
): string[] {
  return [...buildNameTable(state, castCards).keys()]
}
