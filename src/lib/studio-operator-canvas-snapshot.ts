/**
 * 画布 → 操作员快照（进度表 22「一张脸」）。
 *
 * ── 为什么要分层，而不是把整张画布发上去 ────────────────────────────
 * 每一步都是一次完整的 LLM 往返，而一轮只有 `maxSteps` 步（8）。一张六十镜的
 * 画布全展开意味着**整轮的步数全烧在读上下文上** —— 模型还没想清楚要改什么，
 * 预算已经没了。所以焦点那一面镜与它左右各一面完整展开（节点 · 槽 · 参数 ·
 * 连线），其余每面只出一行「叫什么 · 有几个节点」。
 *
 * ⚠ 折叠的镜**不是看不见**：模型知道它存在、叫什么。要看细节就把焦点挪过去再
 * 读一次 —— ⛔ 别为此加一条「展开第 N 镜」的工具，那是 `read_state` 自己的活。
 * ⚠ 折叠的镜里的节点**不进准入名单**（服务端 `canvasNodeIds` 只数展开的那几面）：
 * 模型没看见的节点它不该去改。这条与 `mount_reference` 只认 `searchIndex` 同源。
 *
 * 画布上的 op 一律认节点 id，产出只带 `hasOutput`；图片节点另带实际编译的
 * 参考输入，供服务端复核提示词，不携带完整生成载荷或私有配置。
 */

import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import { DEFAULT_ASPECT_RATIO, type AspectRatio } from '@/constants/config'
import { NODE_V4_PROMPT_MAX_LENGTH } from '@/constants/node-studio'
import {
  ADAPTER_CAPABILITIES,
  getCapabilityConfig,
} from '@/constants/provider-capabilities'
import {
  IMAGE_BATCH_COUNTS,
  STUDIO_IMAGE_ASPECT_RATIOS,
} from '@/constants/studio'
import {
  getVideoModelParameterOptions,
  getVideoModelSendContract,
} from '@/constants/video-model-send-plan'
import {
  getVideoModelCapabilities,
  snapVideoDuration,
  snapVideoResolution,
} from '@/constants/video-model-capabilities'
import type { VideoResolution } from '@/constants/video-options'
import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import { parseScriptShots } from '@/lib/node-script-shots'
import { readScriptShotRef } from '@/lib/node-script-projection'
import { buildV4ImagePayload } from '@/lib/node-slot-payload'
import {
  AssistantOperatorCanvasNodeSchema,
  type AssistantOperatorCanvasNode,
  type AssistantOperatorCanvasShot,
  type AssistantOperatorCanvasSnapshot,
  type AssistantOperatorGenerationRequest,
} from '@/types/assistant-operator'
import { AdvancedParamsSchema } from '@/types'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/** 未归镜的散节点落在这一档（`shotNo` 缺席）。 */
const LOOSE_SHOT_TITLE = 'Unassigned'

/**
 * 一个节点上模型改得动的那几格。
 *
 * 非图片节点只提供摘要；图片提示词需要全文参与追加与参考复核。
 */
const MAX_NODE_TEXT_CHARS = 400

export type CanvasNodeGenerationState = Pick<
  AssistantOperatorCanvasNode,
  'id' | 'name' | 'kind' | 'model' | 'parameters'
>

export function readCanvasNodeGenerationState(
  node: NodeV4,
): CanvasNodeGenerationState {
  const { data } = node
  const state: CanvasNodeGenerationState = {
    id: node.id,
    name: data.name,
    kind: data.kind,
    ...(data.kind === NODE_MEDIA_KIND_IDS.text || !data.model
      ? {}
      : { model: data.model.modelId }),
  }
  if (data.kind === NODE_MEDIA_KIND_IDS.image) {
    const capability =
      data.model && data.model.adapterType in ADAPTER_CAPABILITIES
        ? getCapabilityConfig(data.model.adapterType, data.model.modelId)
        : undefined
    state.parameters = {
      values: {
        ...data.params,
        aspectRatio: data.params?.aspectRatio ?? DEFAULT_ASPECT_RATIO,
        count: data.params?.storyboardGrid ? 1 : (data.params?.count ?? 1),
      },
      options: {
        aspectRatio: [...STUDIO_IMAGE_ASPECT_RATIOS],
        quality: [...(capability?.qualityOptions ?? [])],
        resolution: [...(capability?.resolutionOptions ?? [])],
        count: data.params?.storyboardGrid ? [1] : [...IMAGE_BATCH_COUNTS],
        storyboardGrid: [false, true],
      },
    }
  } else if (data.kind === NODE_MEDIA_KIND_IDS.video) {
    const model = data.model
    const values = { ...data.params }
    if (model) {
      const capabilities = getVideoModelCapabilities(model.modelId)
      const duration = values.duration ? Number(values.duration) : NaN
      if (Number.isFinite(duration)) {
        values.duration = String(snapVideoDuration(model.modelId, duration))
      }
      if (values.resolution) {
        values.resolution = snapVideoResolution(
          model.modelId,
          values.resolution as VideoResolution,
        )
      }
      if (
        values.aspectRatio &&
        capabilities.supportedAspectRatios &&
        !capabilities.supportedAspectRatios.includes(
          values.aspectRatio as AspectRatio,
        )
      ) {
        values.aspectRatio = capabilities.supportedAspectRatios[0]
      }
    }
    const options = getVideoModelParameterOptions(
      model?.modelId,
      model?.adapterType,
    )
    const support = model
      ? getVideoModelSendContract(model.modelId, model.adapterType).parameters
      : undefined
    state.parameters = {
      values,
      options: {
        aspectRatio: [...options.aspectRatios],
        resolution: [...options.resolutions],
        duration: options.durations.map(String),
        ...(support?.generateAudio ? { generateAudio: [false, true] } : {}),
        ...(support?.seed ? { seed: true } : {}),
      },
    }
  }
  return state
}

export function buildCanvasGenerationRequest(
  node: CanvasNodeGenerationState,
): AssistantOperatorGenerationRequest | null {
  if (!node.model) return null
  const params = node.parameters?.values
  const quality = AdvancedParamsSchema.shape.quality.safeParse(params?.quality)
  const duration = params?.duration ? Number(params.duration) : NaN
  return {
    model: { id: node.model, label: node.model },
    count:
      node.kind === NODE_MEDIA_KIND_IDS.image && !params?.storyboardGrid
        ? (params?.count ?? 1)
        : 1,
    specs: {
      aspectRatio: params?.aspectRatio ?? null,
      resolution: params?.resolution ?? null,
      durationSeconds:
        Number.isInteger(duration) && duration > 0 ? duration : null,
      ...(quality.success && quality.data ? { quality: quality.data } : {}),
    },
    canvasNode: { id: node.id, name: node.name },
  }
}

/**
 * 节点上那段字。⭐ 被 @ 或选中的文本节点给**全文**（到快照上限为止）：助手要改的
 * 就是它，只给开头 400 字的表现是整段改写时把没读到的后半段覆盖掉（2026-10-07）。
 * 读不全的一律带 `truncated`，服务端据此拒掉整段替换。
 */
function nodeText(
  node: NodeV4,
  full: boolean,
): { text?: string; truncated?: true } {
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.image) return { text: data.prompt }
  const raw = data.kind === NODE_MEDIA_KIND_IDS.text ? data.body : data.prompt
  const trimmed = raw?.trim()
  if (!trimmed) return {}
  const limit =
    full && data.kind === NODE_MEDIA_KIND_IDS.text
      ? NODE_V4_PROMPT_MAX_LENGTH
      : MAX_NODE_TEXT_CHARS
  return trimmed.length > limit
    ? { text: `${trimmed.slice(0, limit)}…`, truncated: true }
    : { text: trimmed }
}

function imageReviewContext(
  node: NodeV4,
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
): Pick<
  AssistantOperatorCanvasNode,
  'referenceUrls' | 'referencePromptContext' | 'reviewContextComplete'
> {
  if (node.data.kind !== NODE_MEDIA_KIND_IDS.image) return {}
  const payload =
    node.data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.reference
      ? { referenceUrls: [], prompt: '' }
      : buildV4ImagePayload({ nodeId: node.id, nodes, edges })
  const references =
    AssistantOperatorCanvasNodeSchema.shape.referenceUrls.safeParse(
      payload.referenceUrls,
    )
  const promptContext =
    AssistantOperatorCanvasNodeSchema.shape.referencePromptContext.safeParse(
      payload.prompt,
    )
  return {
    ...(references.success ? { referenceUrls: references.data } : {}),
    ...(promptContext.success
      ? { referencePromptContext: promptContext.data }
      : {}),
    reviewContextComplete: references.success && promptContext.success,
  }
}

function nodeHasOutput(node: NodeV4): boolean {
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return false
  return Boolean(data.url)
}

/**
 * 剧本投影那两格（进度表 24）。
 *
 * ⚠ 汇总**跨折叠**统计：折叠的镜模型看不见，但「还有三面与剧本对不上」这句话
 * 它必须知道 —— 否则它会以为投影已经干净了，然后把重投影这一步跳过去。
 * ⚠ 汇总里**没有逐镜列表**：一张六十镜的剧本全列出来就是把整轮步数烧在读上下文
 * 上（与分层同一条理由）。要看具体哪一面变了，把焦点挪到那一镜再读一次。
 */
type ScriptProjectionSummary = NonNullable<
  AssistantOperatorCanvasNode['scriptProjection']
>

function buildScriptProjectionSummaries(
  nodes: readonly NodeV4[],
): Map<string, ScriptProjectionSummary> {
  const summaries = new Map<string, ScriptProjectionSummary>()
  for (const node of nodes) {
    const data = node.data
    if (data.kind !== NODE_MEDIA_KIND_IDS.text) continue
    if (data.subtype !== NODE_V4_TEXT_SUBTYPE_IDS.script) continue
    summaries.set(node.id, {
      shots: parseScriptShots(data.body).shots.length,
      projected: 0,
      changed: 0,
      dropped: 0,
    })
  }
  for (const node of nodes) {
    const ref = readScriptShotRef(node)
    if (!ref) continue
    const summary = summaries.get(ref.scriptNodeId)
    if (!summary) continue
    summaries.set(ref.scriptNodeId, {
      ...summary,
      projected: summary.projected + 1,
      changed:
        summary.changed +
        (ref.state === NODE_SCRIPT_SHOT_STATE_IDS.changed ? 1 : 0),
      dropped:
        summary.dropped +
        (ref.state === NODE_SCRIPT_SHOT_STATE_IDS.dropped ? 1 : 0),
    })
  }
  return summaries
}

function toSnapshotNode(
  node: NodeV4,
  incoming: readonly NodeWorkflowEdgeV4[],
  availableModelsByNodeId:
    | Readonly<Record<string, readonly string[]>>
    | undefined,
  scriptProjections: ReadonlyMap<string, ScriptProjectionSummary>,
  referenceUrls: readonly string[],
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
  fullText: boolean,
): AssistantOperatorCanvasNode {
  const data = node.data
  const { text, truncated } = nodeText(node, fullText)
  const availableModels = availableModelsByNodeId?.[node.id]
  const inputs = incoming
    .slice(0, ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot)
    .map((edge) => ({ slot: edge.slot, from: edge.source }))

  const scriptProjection = scriptProjections.get(node.id)
  const fromScript = readScriptShotRef(node)
  const referenceImageIndex =
    data.kind === NODE_MEDIA_KIND_IDS.image && data.url
      ? referenceUrls.indexOf(data.url)
      : -1

  return {
    ...readCanvasNodeGenerationState(node),
    position: node.position,
    ...(referenceImageIndex < 0 ? {} : { referenceImageIndex }),
    subtype: data.subtype,
    ...(scriptProjection === undefined ? {} : { scriptProjection }),
    ...(fromScript === undefined
      ? {}
      : {
          fromScript: {
            nodeId: fromScript.scriptNodeId,
            shotKey: fromScript.shotKey,
            state: fromScript.state,
          },
        }),
    ...(text === undefined ? {} : { text }),
    ...(truncated ? { textTruncated: true as const } : {}),
    ...imageReviewContext(node, nodes, edges),
    ...(availableModels === undefined || availableModels.length === 0
      ? {}
      : { availableModels: [...new Set(availableModels)] }),
    ...(inputs.length === 0 ? {} : { inputs }),
    ...(nodeHasOutput(node) ? { hasOutput: true } : {}),
  }
}

/**
 * 展开哪三面镜 —— **焦点那面 + 左右各一**。
 *
 * ⚠ 焦点缺席（`null`）时展开**最前面**那三面而不是一面都不展开：一张刚打开的
 * 画布上用户还没点任何东西，而「一面都看不见」会让第一句话必然是一次白问。
 * ⚠ 散节点那一档**永远展开**：它是「还没归到任何一镜」的那些，而用户提到它们时
 * 用的正是名字 —— 折叠掉就指认不了了。
 */
function expandedShotNumbers(
  shotNumbers: readonly number[],
  currentShotNo: number | null,
): Set<number> {
  if (shotNumbers.length === 0) return new Set()
  const focusIndex =
    currentShotNo === null ? 0 : shotNumbers.indexOf(currentShotNo)
  const anchor = focusIndex < 0 ? 0 : focusIndex
  const half = Math.floor(ASSISTANT_OPERATOR_CANVAS_LIMITS.expandedShots / 2)
  const start = Math.max(0, anchor - half)
  return new Set(
    shotNumbers.slice(
      start,
      start + ASSISTANT_OPERATOR_CANVAS_LIMITS.expandedShots,
    ),
  )
}

export interface BuildCanvasSnapshotInput {
  readonly referenceUrls?: readonly string[]
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  /** 焦点所在的镜。`null` = 还没落焦点（展开最前面三面）。 */
  readonly currentShotNo: number | null
  /** 用户此刻选中的节点（⌘K / 右键「问助手」带过来的就是它们）。 */
  readonly selectedNodeIds?: readonly string[]
  /**
   * 每个节点**选得动**的模型。
   *
   * ⚠ 缺席那一格的表现很具体：模型会编一个工作区里不存在的 id
   * （真机上是「Animagine XL」）。宿主按 `useWorkflowModelOptions` 现给，
   * ⛔ 别在这里另查一份。
   */
  readonly availableModelsByNodeId?: Readonly<Record<string, readonly string[]>>
  /** 角色库（`buildCanvasCharacters` 现算）；缺席 = 宿主没给。 */
  readonly characters?: AssistantOperatorCanvasSnapshot['characters']
  /** 这一句里 `@` 到的节点：与选中的一样算焦点，文本节点给全文。 */
  readonly mentionedNodeIds?: readonly string[]
}

export function buildCanvasOperatorSnapshot({
  referenceUrls = [],
  nodes,
  edges,
  currentShotNo,
  selectedNodeIds = [],
  availableModelsByNodeId,
  characters,
  mentionedNodeIds = [],
}: BuildCanvasSnapshotInput): AssistantOperatorCanvasSnapshot {
  const incomingByTarget = new Map<string, NodeWorkflowEdgeV4[]>()
  for (const edge of edges) {
    const list = incomingByTarget.get(edge.target)
    if (list) list.push(edge)
    else incomingByTarget.set(edge.target, [edge])
  }

  const scriptProjections = buildScriptProjectionSummaries(nodes)
  const fullTextNodeIds = new Set([...selectedNodeIds, ...mentionedNodeIds])
  const focusedNodeIds = new Set(fullTextNodeIds)
  const newestNode = nodes.at(-1)
  if (newestNode) focusedNodeIds.add(newestNode.id)
  const inputNodeIds = new Set(
    edges.flatMap((edge) =>
      focusedNodeIds.has(edge.target) ? [edge.source] : [],
    ),
  )

  const byShot = new Map<number | null, NodeV4[]>()
  for (const node of nodes) {
    const shotNo = node.data.shotNo ?? null
    const list = byShot.get(shotNo)
    if (list) list.push(node)
    else byShot.set(shotNo, [node])
  }

  const shotNumbers = [...byShot.keys()]
    .filter((shotNo): shotNo is number => shotNo !== null)
    .sort((a, b) => a - b)
  const expanded = expandedShotNumbers(shotNumbers, currentShotNo)

  const shots: AssistantOperatorCanvasShot[] = []
  const pushShot = (shotNo: number | null, isExpanded: boolean): void => {
    const shotNodes = byShot.get(shotNo) ?? []
    const title = shotNo === null ? LOOSE_SHOT_TITLE : `S${shotNo}`
    if (!isExpanded) {
      shots.push({
        expanded: false,
        shotNo,
        title,
        nodeCount: shotNodes.length,
      })
      return
    }
    const visibleNodeIds = new Set(
      [
        ...new Set(
          [
            ...shotNodes.filter((node) => focusedNodeIds.has(node.id)),
            ...shotNodes.filter((node) => inputNodeIds.has(node.id)),
            ...shotNodes.toReversed(),
          ].map((node) => node.id),
        ),
      ].slice(0, ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot),
    )
    shots.push({
      expanded: true,
      shotNo,
      title,
      nodes: shotNodes
        .filter((node) => visibleNodeIds.has(node.id))
        .map((node) =>
          toSnapshotNode(
            node,
            incomingByTarget.get(node.id) ?? [],
            availableModelsByNodeId,
            scriptProjections,
            referenceUrls,
            nodes,
            edges,
            fullTextNodeIds.has(node.id),
          ),
        ),
    })
  }

  for (const shotNo of shotNumbers) pushShot(shotNo, expanded.has(shotNo))
  // ⚠ 散节点排在最后且永远展开 —— 见 `expandedShotNumbers` 头注。
  if (byShot.has(null)) pushShot(null, true)

  return {
    currentShotNo,
    selectedNodeIds: [...selectedNodeIds].slice(
      0,
      ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot,
    ),
    shots: shots.slice(0, ASSISTANT_OPERATOR_CANVAS_LIMITS.maxShotLines),
    ...(characters ? { characters } : {}),
  }
}
