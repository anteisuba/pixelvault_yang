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
  NODE_SLOT_OUTPUT_IDS,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID,
  NODE_V4_SNAPSHOT,
  resolveReferenceAssetLimit,
} from '@/constants/node-studio'
import {
  NODE_AUDIO_MODEL_NODE_TYPES,
  NODE_IMAGE_MODEL_NODE_TYPES,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  NODE_VIDEO_MODEL_NODE_TYPES,
} from '@/constants/node-types'
import { isIdentityCardNode } from '@/lib/node-workflow-graph'
import {
  formatShotPrefix,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import type { NodeAssistantNodeContext } from '@/types/node-assistant'
import type {
  NodeV4Data,
  NodeV4GenerationParams,
  NodeWorkflowEdgeV4,
  NodeWorkflowNode,
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
export function canCarryImageCategory(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNode['data']
}): boolean {
  return node.type === NODE_TYPE_IDS.image && !isIdentityCardNode(node)
}

/**
 * 这个节点身上有「选模型」这回事吗（`set_model` 的判据）。
 *
 * 三个模型节点类型表的并集，**再减去身份卡** —— 卡片的 type 也在图片那张表里，
 * 但它不产图（`generate` 也拒它，见规划器里那条同源的判据），详情面板压根不给它
 * 渲染模型选择器。往档案夹上挂一个模型是一条三绿而无意义的写入。
 */
export function canCarryModel(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNode['data']
}): boolean {
  const modelNodeTypes: readonly NodeWorkflowNode['type'][] = [
    ...NODE_IMAGE_MODEL_NODE_TYPES,
    ...NODE_VIDEO_MODEL_NODE_TYPES,
    ...NODE_AUDIO_MODEL_NODE_TYPES,
  ]
  return modelNodeTypes.includes(node.type) && !isIdentityCardNode(node)
}

/**
 * 这个节点身上有「生成档位」这回事吗（`set_params` 的判据）。
 *
 * ⚠ 判据是 `NODE_VIDEO_MODEL_NODE_TYPES`（今天只有视频生成节点），**不是**
 * 「媒体种类是 video」：参考视频与合并节点的 kind 也是 video，但它们没有档位
 * 控件、生成路径也不读这些字段。图片节点为什么不在这里，见
 * `NODE_ASSISTANT_PARAM_IDS` 头注的查证结论（档位住在合成条的 React state 里）。
 */
export function canCarryGenerationParams(node: {
  type: NodeWorkflowNode['type']
}): boolean {
  return (NODE_VIDEO_MODEL_NODE_TYPES as readonly string[]).includes(node.type)
}

/**
 * 这个节点收不收参考图（`attach_asset` 的判据）。
 *
 * 人手把素材**挂进 `referenceAssets`** 的入口只有三处，三处都只长在收集器卡
 * （角色卡 / 背景卡）上：档案面板的图集（`nestedAdd`）、选中工具条的「添加素材」、
 * 名册卡落卡。其余节点的参考图走的是**连线**（阶段 3：参考图落散图节点 + 自动
 * 连线），那条路助手已经有 `connect`——所以这里故意窄，不给同一件事开第二条路。
 */
export function canAttachReferenceAsset(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNode['data']
}): boolean {
  return isIdentityCardNode(node)
}

/**
 * 助手 payload 里的 `title` —— **必须是画布上显示的那个名字**。
 *
 * ⚠ 这里曾经是包 4.5 要修的洞：旧实现只认合并前的 `characterImage`（角色早已是
 * `image` + `role=character`，那个分支一次都不会命中），其余类型一律返回
 * `fallbackTitle`，也就是本地化的**类型标签**。于是助手看到的是「图片 / 镜头文本
 * / 视频生成」，用户改的「雨夜开场镜」和角色名「小林」它一个都拿不到，`@` 按名字
 * 引用因此不可能成立。
 *
 * 修法是接上**共享的显示名事实源**，而不是在这里再加一层兜底 —— 再写一套就是
 * 同一个错误的第五份副本。
 */
function resolveTitle(node: NodeWorkflowNode, fallbackTitle: string): string {
  return resolveNodeDisplayName(node.data) ?? fallbackTitle
}

/**
 * 视频节点的档位现值 → payload。**原样带**，不做单位美化：`duration` 在数据层
 * 就是字符串（`'6'` / `'auto'`），模型写回时写的也是同一套值。
 *
 * 没设的档位直接缺席（与 `promptExcerpt` 同一条：一个空值渲染出来读起来像
 * 「设成了空」，而它其实是「还没设」）。
 */
function buildParamsContext(
  data: NodeWorkflowNode['data'],
): NonNullable<NodeAssistantNodeContext['params']> {
  const aspectRatio = data.aspectRatio?.trim()
  const resolution = data.resolution?.trim()
  const duration = data.duration?.trim()
  return {
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(duration ? { duration } : {}),
    ...(typeof data.generateAudio === 'boolean'
      ? { generateAudio: data.generateAudio }
      : {}),
    ...(typeof data.seed === 'number' ? { seed: data.seed } : {}),
  }
}

export interface BuildNodeAssistantNodeContextsOptions {
  /** 没有显示名时兜底用的本地化类型标签（`StudioNode.nodeTypes`）。 */
  getNodeTypeLabel(type: NodeWorkflowNode['type']): string
}

/**
 * 一批画布节点 → 助手看得见的现值。
 *
 * 上限走 `NODE_STUDIO_ASSISTANT_LIMITS`：节点数 `maxNodes`（32）先截断，再逐条
 * 按 `maxNodeLabelLength` / `maxNodeSummaryLength` 截字。截断是**取前 N 个**，
 * 不做任何「挑重要的」排序 —— 排序需要一个「什么叫重要」的定义，那是另一件事，
 * 在它被定义之前，可预测的前 N 个比一个猜出来的排名诚实。
 */
export function buildNodeAssistantNodeContexts(
  nodes: readonly NodeWorkflowNode[],
  { getNodeTypeLabel }: BuildNodeAssistantNodeContextsOptions,
): NodeAssistantNodeContext[] {
  return nodes.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodes).map((node) => {
    const prompt = node.data.prompt?.trim()
    const category = canCarryImageCategory(node)
      ? (node.data.imageCategory ?? NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID)
      : undefined
    const categoryLabel = node.data.imageCategoryLabel?.trim()
    // 与分类同构的三态：能选模型就一定有这个字段，没选就说 `unset`。
    const model = canCarryModel(node)
      ? (node.data.model?.modelId ?? NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID)
      : undefined
    const params = canCarryGenerationParams(node)
      ? buildParamsContext(node.data)
      : undefined
    const references = canAttachReferenceAsset(node)
      ? {
          limit: resolveReferenceAssetLimit(node.data.model),
          items: (node.data.referenceAssets ?? [])
            .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences)
            // ⛔ 只取 role 与源节点 id —— `url` 一个字都不进 payload。
            .map((asset) => ({
              role: asset.role,
              ...(asset.sourceId ? { sourceId: asset.sourceId } : {}),
            })),
        }
      : undefined

    return {
      id: node.id,
      type: node.type,
      status: node.data.status,
      title: truncateNodeAssistantText(
        resolveTitle(node, getNodeTypeLabel(node.type)),
        NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength,
      ),
      // 空提示词不占位：`promptExcerpt` 缺席 = 这个节点还没有提示词，
      // 而一个空串会被渲染成 `prompt: ""`，读起来像「提示词是空的」——
      // 两者对模型是同一句话，但空串还要多花 token 说它。
      ...(prompt
        ? {
            promptExcerpt: truncateNodeAssistantText(
              prompt,
              NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
            ),
          }
        : {}),
      ...(category ? { imageCategory: category } : {}),
      ...(category && categoryLabel
        ? { imageCategoryLabel: categoryLabel }
        : {}),
      ...(model ? { model } : {}),
      // ⚠ 空对象是**有意义的值**（「有档位、一个都没设」），而它在 JS 里恰好是
      // truthy，所以这么写就能发出去。⛔ 别「优化」成
      // `Object.keys(params).length > 0` —— 那会把三态压回两态，模型又分不出
      // 「这节点没有档位」和「还没设」。
      ...(params ? { params } : {}),
      ...(references ? { references } : {}),
    } satisfies NodeAssistantNodeContext
  })
}

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
): SlotLine[] {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports) return []
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
        })
      }
      continue
    }
    for (const edge of edges) {
      if (edge.target !== node.id || edge.slot !== spec.slot) continue
      lines.push({ slot: spec.slot, sourceId: edge.source, versionCount: 1 })
    }
  }
  return lines
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
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `  ${line.slot} ${NODE_V4_SNAPSHOT.slotArrow} [[node:${line.sourceId}]] ${name}${suffix}`.trimEnd()
}

/** 镜头行（完整档与标题档共用同一行）。 */
function renderShotHeadline(node: CanvasSnapshotV4Node): string {
  const { data } = node
  const parts = [nodeTypeLabel(data), data.status]
  const params = readParams(data)
  if (params?.duration) parts.push(params.duration)
  if (data.kind !== NODE_MEDIA_KIND_IDS.text && data.model?.modelId) {
    parts.push(data.model.modelId)
  }
  if (params?.aspectRatio) parts.push(params.aspectRatio)
  const shot =
    data.shotNo === undefined ? '' : `${formatShotPrefix(data.shotNo)} `
  return `${shot}[[node:${node.id}]] ${parts.join(NODE_V4_SNAPSHOT.fieldSeparator)}`
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
  return `[[node:${node.id}]] ${data.name} (${parts.join(', ')})`
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
    for (const line of collectSlotLines(node, edges)) {
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
        collectSlotLines(node, edges),
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
          collectSlotLines(node, edges),
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
