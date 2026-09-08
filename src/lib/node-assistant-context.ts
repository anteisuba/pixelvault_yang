/**
 * 画布 → 助手的**节点现值投影**（切片 5 第一批）。
 *
 * ── 为什么是独立模块 ────────────────────────────────────────────────
 * 这段逻辑原本长在 `StudioNodeAssistantDock` 的一个 `useMemo` 里。它决定了模型
 * **能看见什么**，而看不见就只能编（工作台那边给不出可选模型列表，模型就编了个
 * 不存在的「Animagine XL」）。这种东西必须能单独测：空态、截断、以及「哪些节点
 * 有分类字段」的判据，一个都不该只能靠打开画布才验得到。
 *
 * ── 与 studio 的 `assistant-workbench-state` 的关系 ──────────────────
 * 同一套气质（空态要说出来、不冒充未知、有上限），但**形状不同**：工作台是一张
 * 表单（单数），画布是一串节点（复数）。所以这里不套那边的分节文本，只按节点逐条
 * 投影，渲染成给模型看的行的活儿留给 service 那一层。
 */

import {
  getNodeV4Ports,
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  type NodeSlotId,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_V4_SNAPSHOT,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import {
  formatShotDisplayName,
  formatShotPrefix,
} from '@/lib/node-display-name'
import { resolveTextSlotRole } from '@/lib/node-connection-rules'
import type {
  NodeV4Data,
  NodeV4GenerationParams,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

export function truncateNodeAssistantText(
  value: string,
  maxLength: number,
): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`
    : trimmed
}

/**
 * 这个节点身上有「图片分类」这回事吗 —— 判据必须与**人手的入口**一致。
 *
 * 人手能标分类的地方只有两处，两处都只挂在图片节点上：详情面板的
 * `LooseImageDetailBody` 那颗下拉，和 `CanvasImageSelectionToolbar` 的 ⋯ 菜单。
 * 身份卡（角色卡 / 背景卡）不算 —— 它是档案夹不是图，`type` 同样是 `image`，
 * 只能靠 `isIdentityCardNode` 分出来。
 *
 * ⛔ 别改成「按 media kind 判」：卡片的 kind 也是 image，那样会把卡片算进来。
 */
/* ═════════════════════════════════════════════════════════════════════════
 * v4 · 快照序列化（第三期 · 画布 C1，spec §4.4）
 *
 * ── 它替掉的是什么 ──────────────────────────────────────────────────────
 * 现状每节点一行、**没有边**、上限 32 且不排序取前 N。没有边意味着助手看不见
 * 「谁挂在谁的首帧上」——在镜头模型下这是致命的：`@S02·首帧` 指谁、改哪一个，
 * 全靠猜。
 *
 * ── 两条硬规则 ──────────────────────────────────────────────────────────
 * ① **边内联在目标节点下**（`slot ← 源`），不单列 edges 段：镜头模型下边几乎都是
 *    「进某个槽」，内联比另起一段省 token 且更好读。跨镜的 `tailFrame → firstFrame`
 *    另起 `# 接续` 一段。
 * ② **分层取代节点数硬上限**：完整档（当前镜 + 相邻两镜 + 选中 + 最近改动）给整段
 *    结构，其余每镜一行标题。⛔ 不做「取前 N」——那会让模型以为自己看全了。
 *    槽内版本只报当前版 + 版本数，非当前版不进快照（§1.4）。
 *
 * ⛔ 本片只做纯函数。`node-assistant.service.ts` 的调用方改接它是 C2。
 * ═════════════════════════════════════════════════════════════════════════ */

export interface CanvasSnapshotV4Node {
  readonly id: string
  readonly data: NodeV4Data
}

export interface BuildCanvasSnapshotV4Options {
  /** 用户当前所在的镜号。它与相邻两镜进完整档。 */
  readonly currentShotNo?: number
  /** 选中的节点——**升为完整档，即使离当前镜很远**（用户正看着的就是他下一句要说的）。 */
  readonly selectedIds?: readonly string[]
  /** 最近改动的节点，同上升档。 */
  readonly changedIds?: readonly string[]
  /** 标题档最多列几行（不是节点数上限）。默认 `NODE_STUDIO_ASSISTANT_LIMITS.maxNodes`。 */
  readonly maxTitleRows?: number
}

interface SlotLine {
  readonly slot: NodeSlotId
  readonly sourceId: string
  readonly versionCount: number
  /** 文本槽的角色（C1 契约修正 2）。非文本槽缺席。 */
  readonly role?: NodeSlotTextRole
}

function nodeTypeLabel(data: NodeV4Data): string {
  return `${data.kind}.${data.subtype}`
}

function readParams(data: NodeV4Data): NodeV4GenerationParams | undefined {
  return data.kind === NODE_MEDIA_KIND_IDS.image ||
    data.kind === NODE_MEDIA_KIND_IDS.video
    ? data.params
    : undefined
}

function readPrompt(data: NodeV4Data): string | undefined {
  if (data.kind === NODE_MEDIA_KIND_IDS.text)
    return data.body.trim() || undefined
  return data.prompt?.trim() || undefined
}

/**
 * 一个节点各槽的当前绑定 → 快照行。顺序走端口表（= 画布上自上而下的顺序）。
 *
 * 优先读 `data.slots` 的 `cur`（轮播槽只报当前版）；没有 binding 的槽回落到边表，
 * 那是 0..N 槽的常态（它们本来就是多值并列，不做轮播）。
 */
export function collectSlotLines(
  node: CanvasSnapshotV4Node,
  edges: readonly NodeWorkflowEdgeV4[],
  byId?: ReadonlyMap<string, CanvasSnapshotV4Node>,
): SlotLine[] {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports) return []
  // 文本槽的角色：版本上显式写了就用它，没写就问源节点（`defaultRole` / 子型）。
  // ⛔ 不在这里瞎猜——`resolveTextSlotRole` 是那条优先链的唯一实现。
  const roleOf = (
    slot: NodeSlotId,
    sourceId: string,
    explicitRole?: NodeSlotTextRole,
  ): NodeSlotTextRole | undefined => {
    if (slot !== NODE_SLOT_IDS.text) return undefined
    const source = byId?.get(sourceId)
    return resolveTextSlotRole({
      subtype: source?.data.subtype ?? node.data.subtype,
      defaultRole:
        source?.data.kind === NODE_MEDIA_KIND_IDS.text
          ? source.data.defaultRole
          : undefined,
      explicitRole,
    })
  }
  const lines: SlotLine[] = []
  for (const spec of ports.inputs) {
    const binding = node.data.slots?.[spec.slot]
    if (binding) {
      const current = binding.versions.find((v) => v.id === binding.cur)
      if (current) {
        lines.push({
          slot: spec.slot,
          sourceId: current.sourceNodeId,
          versionCount: binding.versions.length,
          ...(roleOf(spec.slot, current.sourceNodeId, current.role)
            ? { role: roleOf(spec.slot, current.sourceNodeId, current.role) }
            : {}),
        })
      }
      continue
    }
    for (const edge of edges) {
      if (edge.target !== node.id || edge.slot !== spec.slot) continue
      const role = roleOf(spec.slot, edge.source)
      lines.push({
        slot: spec.slot,
        sourceId: edge.source,
        versionCount: 1,
        ...(role ? { role } : {}),
      })
    }
  }
  return lines
}

/**
 * 角色节点硬链的角色卡（C1 契约修正 3）：行内写 `[卡:名]`。
 * ⛔ 只给名字不给 id —— id 对模型无意义，还白占 token；名字从 `characterName` 取。
 */
function renderCardMark(data: NodeV4Data): string {
  if (
    data.kind !== NODE_MEDIA_KIND_IDS.image ||
    data.subtype !== NODE_V4_IMAGE_SUBTYPE_IDS.character ||
    !data.contextCardId
  ) {
    return ''
  }
  const name = data.characterName ?? data.name
  return ` ${NODE_V4_SNAPSHOT.cardPrefix}${name}${NODE_V4_SNAPSHOT.cardSuffix}`
}

function renderSlotLine(
  line: SlotLine,
  byId: ReadonlyMap<string, CanvasSnapshotV4Node>,
): string {
  const source = byId.get(line.sourceId)
  const parts: string[] = []
  if (source) {
    parts.push(nodeTypeLabel(source.data), source.data.status)
    if (
      source.data.kind === NODE_MEDIA_KIND_IDS.audio &&
      source.data.ownerName
    ) {
      parts.push(`${NODE_V4_SNAPSHOT.ownerPrefix}${source.data.ownerName}`)
    }
  }
  if (line.versionCount > 1) {
    parts.push(
      `${NODE_V4_SNAPSHOT.currentVersion}${NODE_V4_SNAPSHOT.fieldSeparator}${NODE_V4_SNAPSHOT.versionCountPrefix}${line.versionCount}${NODE_V4_SNAPSHOT.versionCountSuffix}`,
    )
  }
  const name = source ? source.data.name : ''
  const card = source ? renderCardMark(source.data) : ''
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  // 文本槽按角色分列：`text[剧本]` / `text[风格约束]` / `text[角色描述]`——
  // 混成一行，模型就分不出「要拍的内容」和「不许违反的约束」。
  const slotLabel =
    line.role === undefined
      ? line.slot
      : `${line.slot}[${NODE_V4_SNAPSHOT.textRoleLabels[line.role]}]`
  return `  ${slotLabel} ${NODE_V4_SNAPSHOT.slotArrow} [[node:${line.sourceId}]] ${name}${card}${suffix}`.trimEnd()
}

/** 镜头行（完整档与标题档共用同一行）。 */
/**
 * 一个 v4 节点在助手眼里的**读出名**。
 *
 * ⚠ 镜头读的是 `label` 不是 `name`（C1 契约修正 1）：标签才是稳定名，换序只动
 * 序号。抽成共享函数是因为快照与「选中节点」那一段必须报**同一个名字** ——
 * 两处各解一次，用户 `@` 的那个词就会在两段上下文里长得不一样。
 */
export function resolveV4NodeReadableName(data: NodeV4Data): string {
  const label =
    data.kind === NODE_MEDIA_KIND_IDS.video
      ? (data.label ?? data.name)
      : data.name
  return data.shotNo === undefined
    ? label
    : formatShotDisplayName(label, data.shotNo)
}

function renderShotHeadline(node: CanvasSnapshotV4Node): string {
  const { data } = node
  const parts = [nodeTypeLabel(data), data.status]
  const params = readParams(data)
  if (params?.duration) parts.push(params.duration)
  if (data.kind !== NODE_MEDIA_KIND_IDS.text && data.model?.modelId) {
    parts.push(data.model.modelId)
  }
  if (params?.aspectRatio) parts.push(params.aspectRatio)
  return `${resolveV4NodeReadableName(data)} [[node:${node.id}]] ${parts.join(NODE_V4_SNAPSHOT.fieldSeparator)}`
}

/** 散节点 / 非镜头节点的一行摘要。 */
function renderPlainLine(node: CanvasSnapshotV4Node): string {
  const { data } = node
  const parts = [nodeTypeLabel(data), data.status]
  if (data.kind === NODE_MEDIA_KIND_IDS.image && data.blocked) {
    parts.push(
      `${NODE_V4_SNAPSHOT.blockedPrefix}${data.blockedReason ?? ''}`.trimEnd(),
    )
  }
  return `[[node:${node.id}]] ${data.name}${renderCardMark(data)} (${parts.join(', ')})`
}

function renderParamsLine(data: NodeV4Data): string | undefined {
  const params = readParams(data)
  if (!params) return undefined
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  )
  if (entries.length === 0) return undefined
  return `  ${NODE_V4_SNAPSHOT.paramsPrefix}${entries
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ')}`
}

/**
 * 一个节点的完整档区块：节点行 + 槽行 + prompt + params。
 * `budget` 用尽时按 §4.4 的降级顺序砍：先 prompt，再 params。
 */
function renderFullBlock(
  node: CanvasSnapshotV4Node,
  slotLines: readonly SlotLine[],
  byId: ReadonlyMap<string, CanvasSnapshotV4Node>,
  isShot: boolean,
  budget: number,
): { lines: string[]; demoted: boolean } {
  const head = isShot ? renderShotHeadline(node) : renderPlainLine(node)
  const slots = slotLines.map((line) => renderSlotLine(line, byId))
  const prompt = readPrompt(node.data)
  const promptLine =
    prompt === undefined
      ? undefined
      : `  ${NODE_V4_SNAPSHOT.promptPrefix}${truncateNodeAssistantText(prompt, NODE_V4_SNAPSHOT.maxPromptLength)}`
  const paramsLine = renderParamsLine(node.data)

  const candidates = [
    [head, ...slots, promptLine, paramsLine],
    [head, ...slots, paramsLine],
    [head, ...slots],
  ]
  for (const candidate of candidates) {
    const lines = candidate.filter((line): line is string => Boolean(line))
    if (lines.join('\n').length <= budget) return { lines, demoted: false }
  }
  return { lines: [head], demoted: true }
}

/**
 * 整张画布 → 助手看得见的那段文本。纯函数：不读 DOM、不读 store、不发请求。
 */
export function buildNodeCanvasSnapshotV4(
  nodes: readonly CanvasSnapshotV4Node[],
  edges: readonly NodeWorkflowEdgeV4[],
  options: BuildCanvasSnapshotV4Options = {},
): string {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const promoted = new Set([
    ...(options.selectedIds ?? []),
    ...(options.changedIds ?? []),
  ])
  const maxTitleRows =
    options.maxTitleRows ?? NODE_STUDIO_ASSISTANT_LIMITS.maxNodes

  // 被某个槽引用的源节点不再单列——它已经内联在目标节点下面了。
  const inlined = new Set<string>()
  for (const node of nodes) {
    for (const line of collectSlotLines(node, edges, byId)) {
      inlined.add(line.sourceId)
    }
  }

  const shotNos = [
    ...new Set(
      nodes
        .map((node) => node.data.shotNo)
        .filter((shotNo): shotNo is number => shotNo !== undefined),
    ),
  ].sort((a, b) => a - b)

  const isFullTier = (shotNo: number): boolean => {
    if (
      options.currentShotNo !== undefined &&
      Math.abs(shotNo - options.currentShotNo) <=
        NODE_V4_SNAPSHOT.neighborRadius
    ) {
      return true
    }
    return nodes.some(
      (node) => node.data.shotNo === shotNo && promoted.has(node.id),
    )
  }

  const fullLines: string[] = []
  const titleLines: string[] = []
  const demotedShots: number[] = []

  for (const shotNo of shotNos) {
    const shotNodes = nodes.filter((node) => node.data.shotNo === shotNo)
    const headliners = shotNodes.filter(
      (node) => !inlined.has(node.id) || promoted.has(node.id),
    )
    if (!isFullTier(shotNo)) {
      for (const node of headliners) titleLines.push(renderShotHeadline(node))
      continue
    }
    for (const node of headliners) {
      const isShot =
        node.data.kind === NODE_MEDIA_KIND_IDS.video &&
        node.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      const block = renderFullBlock(
        node,
        collectSlotLines(node, edges, byId),
        byId,
        isShot,
        NODE_V4_SNAPSHOT.maxShotBlockLength,
      )
      fullLines.push(...block.lines)
      if (block.demoted) demotedShots.push(shotNo)
    }
  }

  const looseNodes = nodes.filter(
    (node) => node.data.shotNo === undefined && !inlined.has(node.id),
  )
  const looseLines: string[] = []
  for (const node of looseNodes) {
    if (promoted.has(node.id)) {
      looseLines.push(
        ...renderFullBlock(
          node,
          collectSlotLines(node, edges, byId),
          byId,
          false,
          NODE_V4_SNAPSHOT.maxShotBlockLength,
        ).lines,
      )
      continue
    }
    looseLines.push(renderPlainLine(node))
  }

  // 跨镜接续边（`tailFrame → firstFrame`）单列一段——它不属于任何一个槽块的内联。
  const continuityLines = edges
    .filter((edge) => edge.sourceHandle === NODE_SLOT_OUTPUT_IDS.tailFrame)
    .map(
      (edge) =>
        `[[node:${edge.source}]] ${NODE_SLOT_OUTPUT_IDS.tailFrame} → [[node:${edge.target}]] ${edge.slot}`,
    )

  const sections: string[] = []
  const shotBody = [...fullLines, ...titleLines.slice(0, maxTitleRows)]
  if (titleLines.length > maxTitleRows) {
    shotBody.push(
      `${NODE_V4_SNAPSHOT.omittedPrefix}${titleLines.length - maxTitleRows}${NODE_V4_SNAPSHOT.omittedSuffix}`,
    )
  }
  for (const shotNo of demotedShots) {
    shotBody.push(
      `${formatShotPrefix(shotNo)}${NODE_V4_SNAPSHOT.demotedSuffix}`,
    )
  }
  if (shotBody.length > 0) {
    sections.push([NODE_V4_SNAPSHOT.shotSection, ...shotBody].join('\n'))
  }
  if (looseLines.length > 0) {
    sections.push([NODE_V4_SNAPSHOT.looseSection, ...looseLines].join('\n'))
  }
  if (continuityLines.length > 0) {
    sections.push(
      [NODE_V4_SNAPSHOT.continuitySection, ...continuityLines].join('\n'),
    )
  }
  return sections.join('\n')
}
