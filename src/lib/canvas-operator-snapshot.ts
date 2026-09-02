/**
 * 画布快照的**纯构造**（C1）—— `AssistantOperatorSnapshot.canvas` 那一节从活的
 * 工作流长出来（任务书 §2.2 / 附录 D）。
 *
 * ── 与 `studio-operator-snapshot.ts` 同一条硬规矩 ─────────────────────
 * **控件不在，整个键就不给。** 节点不选模型 → 没有 `model` 键；节点不带档位 →
 * 没有 `params` 键；不是身份卡 → 没有 `character` 键。⛔ 别为了形状整齐补
 * `?? null`：`null` 在 `model` 上是「有选择器、还没选」这一档，是另一个意思。
 *
 * ── 快照根上**没有 `prompt`**（附录 D §1）──────────────────────────
 * 画布上没有「这台工作台的提示词框」，每一格都是某个节点的。service 对缺席按空串处理。
 *
 * ── URL 进快照、不进首轮提示（K-4）───────────────────────────────
 * 参考图 URL / 主媒体 URL / 角色外观（`character.{name, visualSeed}`）都在这里给全，
 * 服务端只在 `read_node` 时按需取，概览与系统提示一个字都不带（service 两向测试锁）。
 *
 * ── 模型目录（附录 D §7）────────────────────────────────────────────
 * 按 nodeType 列、modelId 与 optionId 成对（K-3）、只放此刻**真能跑**的渠道
 * （`isRunnableModelOption`，与选择器同一个谓词）。⚠ 只列**画布上出现过的**能选
 * 模型的 nodeType：图片族有六个 type 共用同一张 45 行的表，全列会撞
 * `maxCanvasModelOptions`（64）的护栏还把一样的行印六遍。`priceLabel` 是相对价签：
 * 同 nodeType 内相对最便宜那条渠道的倍数（`1×` / `2.2×`），免费渠道印 `free`。
 */

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { NODE_ASSISTANT_PARAMS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELDS_BY_IMAGE_ROLE,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { getProviderLabel } from '@/constants/providers'
import type {
  AssistantOperatorCanvasModelOption,
  AssistantOperatorCanvasNode,
  AssistantOperatorSnapshot,
  AssistantOperatorSnapshotCanvas,
} from '@/types/assistant-operator'
import type {
  NodeWorkflowEdge,
  NodeWorkflowModelOption,
  NodeWorkflowModelOptionsByType,
  NodeWorkflowNode,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'
import { isRunnableModelOption } from '@/hooks/use-split-model-options'
import {
  canCarryGenerationParams,
  canCarryImageCategory,
  canCarryModel,
} from '@/lib/node-assistant-context'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import {
  getNodePrimaryMediaUrl,
  isIdentityCardNode,
} from '@/lib/node-workflow-graph'

const LIMITS = ASSISTANT_OPERATOR_LIMITS

/** 免费渠道的相对价签。⚠ 是展示串不是数，与 `priceLabel` 的契约（可选展示串）一致。 */
export const CANVAS_OPERATOR_FREE_PRICE_LABEL = 'free'

export interface CanvasOperatorSnapshotInput {
  projectId: string
  projectName: string
  nodes: readonly NodeWorkflowNode[]
  edges: readonly NodeWorkflowEdge[]
  scriptDoc: ScriptDoc | undefined
  modelOptionsByType: NodeWorkflowModelOptionsByType
  /** 没有显示名时兜底用的本地化类型标签（`StudioNode.nodeTypes`）。 */
  getNodeTypeLabel(type: NodeWorkflowNodeType): string
}

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
}

/**
 * 这个节点**真有**的自由文本字段（与服务端 `canvasTextFieldsFor` 逐字同源：族表按
 * role → type 查，没登记的类型只有 `prompt`）。带档位的节点上档位名从文本栏剔掉
 * （`duration` 两张表各登记一次），它在 `params` 里。
 */
function textFieldsFor(node: NodeWorkflowNode): readonly NodeWorkflowFieldId[] {
  const fields = node.data.role
    ? NODE_WORKFLOW_FIELDS_BY_IMAGE_ROLE[node.data.role]
    : NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[node.type]
  const all = fields ?? [NODE_WORKFLOW_FIELD_IDS.prompt]
  return canCarryGenerationParams(node)
    ? all.filter(
        (field) =>
          !(NODE_ASSISTANT_PARAMS as readonly string[]).includes(field),
      )
    : all
}

function hasReferenceRack(type: NodeWorkflowNodeType): boolean {
  const kind = NODE_MEDIA_KIND_BY_NODE_TYPE[type]
  return (
    kind === NODE_MEDIA_KIND_IDS.image || kind === NODE_MEDIA_KIND_IDS.video
  )
}

function buildParams(
  data: NodeWorkflowNode['data'],
): NonNullable<AssistantOperatorCanvasNode['params']> {
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

export function buildCanvasOperatorNode(
  node: NodeWorkflowNode,
  getNodeTypeLabel: CanvasOperatorSnapshotInput['getNodeTypeLabel'],
): AssistantOperatorCanvasNode {
  const { data } = node
  const fields: Record<string, string> = {}
  for (const field of textFieldsFor(node)) {
    const value = data[field]
    fields[field] =
      typeof value === 'string' ? clamp(value, LIMITS.maxPromptChars) : ''
  }

  const mediaUrl = getNodePrimaryMediaUrl(data)
  const reviewState = mediaUrl ? data.mediaReview?.[mediaUrl]?.state : undefined
  const isLooseImage = canCarryImageCategory(node)
  const imageCategory = isLooseImage ? data.imageCategory : undefined
  const imageCategoryLabel = data.imageCategoryLabel?.trim()
  const characterName = data.character?.name?.trim()
  const visualSeed = data.character?.visualSeed?.trim()
  const cardId = data.cardId?.trim()

  return {
    id: node.id,
    type: node.type,
    title: clamp(
      resolveNodeDisplayName(data) ?? getNodeTypeLabel(node.type),
      LIMITS.maxIdChars,
    ),
    status: data.status,
    ...(node.type === NODE_TYPE_IDS.image && data.role
      ? { role: data.role }
      : {}),
    ...(imageCategory ? { imageCategory } : {}),
    ...(imageCategory && imageCategoryLabel ? { imageCategoryLabel } : {}),
    fields,
    ...(canCarryModel(node)
      ? {
          model: data.model
            ? { modelId: data.model.modelId, optionId: data.model.optionId }
            : null,
        }
      : {}),
    ...(canCarryGenerationParams(node) ? { params: buildParams(data) } : {}),
    references: hasReferenceRack(node.type)
      ? (data.referenceAssets ?? [])
          .slice(0, LIMITS.maxCanvasNodeReferences)
          .map((asset) => ({
            id: asset.id,
            role: asset.role,
            ...(asset.sourceId ? { sourceId: asset.sourceId } : {}),
            url: asset.url,
          }))
      : [],
    ...(isIdentityCardNode(node)
      ? {
          character: {
            ...(characterName
              ? { name: clamp(characterName, LIMITS.maxLabelChars) }
              : {}),
            ...(visualSeed
              ? { visualSeed: clamp(visualSeed, LIMITS.maxPromptChars) }
              : {}),
            ...(cardId ? { cardId } : {}),
          },
        }
      : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(reviewState ? { reviewState } : {}),
  }
}

/** `1×` / `2.2×`：相对同 nodeType 内最便宜的可跑渠道；免费渠道印 `free`。 */
export function describeRelativePrice(
  requestCount: number,
  cheapest: number,
  freeTier: boolean | undefined,
): string {
  if (freeTier || requestCount <= 0) return CANVAS_OPERATOR_FREE_PRICE_LABEL
  if (cheapest <= 0) return `${requestCount}×`
  const ratio = requestCount / cheapest
  const rounded = Number.isInteger(ratio) ? String(ratio) : ratio.toFixed(1)
  return `${rounded}×`
}

function describeModelOption(option: NodeWorkflowModelOption): string {
  return clamp(
    `${option.modelId} · ${getProviderLabel(option.providerConfig)} · ${option.requestCount} credits`,
    LIMITS.maxLabelChars,
  )
}

export function buildCanvasOperatorModelOptions(
  nodes: readonly NodeWorkflowNode[],
  modelOptionsByType: NodeWorkflowModelOptionsByType,
): AssistantOperatorCanvasModelOption[] {
  const nodeTypes = new Set<NodeWorkflowNodeType>()
  for (const node of nodes) {
    if (canCarryModel(node)) nodeTypes.add(node.type)
  }
  const rows: AssistantOperatorCanvasModelOption[] = []
  for (const nodeType of nodeTypes) {
    const runnable = (modelOptionsByType[nodeType] ?? []).filter(
      isRunnableModelOption,
    )
    const paid = runnable.filter(
      (option) => !option.freeTier && option.requestCount > 0,
    )
    const cheapest =
      paid.length > 0
        ? Math.min(...paid.map((option) => option.requestCount))
        : 0
    for (const option of runnable) {
      rows.push({
        nodeType,
        modelId: option.modelId,
        optionId: option.optionId,
        label: describeModelOption(option),
        priceLabel: describeRelativePrice(
          option.requestCount,
          cheapest,
          option.freeTier,
        ),
      })
    }
  }
  return rows.slice(0, LIMITS.maxCanvasModelOptions)
}

export function buildCanvasOperatorSnapshotCanvas(
  input: CanvasOperatorSnapshotInput,
): AssistantOperatorSnapshotCanvas {
  const nodes = input.nodes.slice(0, LIMITS.maxCanvasNodes)
  const logline = input.scriptDoc?.logline?.trim() ?? ''
  return {
    projectId: input.projectId,
    projectName: clamp(input.projectName.trim(), LIMITS.maxIdChars),
    selectedNodeIds: nodes
      .filter((node) => node.selected)
      .map((node) => node.id),
    nodes: nodes.map((node) =>
      buildCanvasOperatorNode(node, input.getNodeTypeLabel),
    ),
    edges: input.edges.slice(0, LIMITS.maxCanvasEdges).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
    modelOptions: buildCanvasOperatorModelOptions(
      nodes,
      input.modelOptionsByType,
    ),
    // C3 填内容，C0 留位：此刻只给 logline —— 有 ScriptDoc 就带键（空串 = 有文档但
    // 还没写 logline），没有文档整个键不给。
    ...(input.scriptDoc
      ? {
          scriptDoc: {
            summary: clamp(logline, LIMITS.maxCanvasScriptDocSummaryChars),
          },
        }
      : {}),
  }
}

/** 整份快照：根上**只有** `canvas`（与 `availableModels` 的 schema 默认值）—— 没有 `prompt`。 */
export function buildCanvasOperatorSnapshot(
  input: CanvasOperatorSnapshotInput,
): AssistantOperatorSnapshot {
  return {
    availableModels: [],
    canvas: buildCanvasOperatorSnapshotCanvas(input),
  }
}
