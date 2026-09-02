/**
 * 把服务端吐的**画布 op** 落到节点图上（C1 正片 —— `StudioNodeWorkbench.tsx`
 * 旧 op 执行块 `:3729-4116` 的抽出与重写）。
 *
 * ── 形状 ────────────────────────────────────────────────────────────
 * `applyCanvasOperatorStep(graph, step, aliases, input) → { patch, inverse, aliases }`
 * 纯函数：零 React、零生成标识符（`canvas-operator-apply.money-gate.test.ts` 读源码
 * 锁死）。`patch` 与 `inverse` 是**同一形状**的 `NodeWorkflowGraphPatch`，宿主用同
 * 一个 `applyNodeWorkflowGraphPatch` 施加两者 —— 应用与撤销是同一份判据的两侧
 * （拍板 18），单测里能做 apply → inverse 的往返断言。
 *
 * ── 为什么 inverse 在客户端自己算，而不是抄服务端的 `step.inverse` ───────
 * 服务端的 inverse 是契约（缺它出流前被拒），但它说的是**工作副本**上的改前值；
 * 真正落笔的图在这里，而且服务端不知道 `title` 落在 `characterName` 还是
 * `shotName`、不知道 `mediaReview` 记录的全貌。以此刻的图为准算出的逆补丁才是
 * 「撤回到改之前」而不是「撤回到服务端以为的改之前」。别名 / refIds 这些服务端
 * 逆操作里的钥匙，这里都用真实 id 重新落一遍。
 *
 * ── 别名（`new:<n>`）─────────────────────────────────────────────────
 * `stage_nodes` 在服务端没有真实 id，一批建出来后同一轮里 `connect_nodes` /
 * `set_node_fields` / `attach_refs` 按别名引用。真实 id 在**这里**分配
 * （`input.createId` 注入 —— 与 `useNodeWorkflow.addNode` 同一把 `createWorkflowId`，
 * 本模块不许造第二种 id 形状），别名表随返回值往外走，宿主拿着它喂下一步。
 * 表随 run 存活：服务端每轮从 `new:1` 重编，下一轮的 `stage_nodes` 原地覆盖同名
 * 别名；一轮里引用未登记别名的步在服务端就被 `aliasUnresolved` 拒掉，到不了这里。
 *
 * ── 三条不许犯的错 ─────────────────────────────────────────────────
 * ① **建节点的形状与人手一致**：`createDefaultNodeData(type)` + role 族默认 data
 *    + `role`（逐字照抄 `createCanvasObject`），⛔ 不手写第二份默认 data。
 * ② **落点解析只查表**：title 走 `buildDisplayNamePatch`，自由文本按 key 直落
 *    （key 合法性服务端按族表判过，`unknownField`），⛔ 这里不再发明落点。
 * ③ **`approved` 到不了落笔**：服务端按 `approvedForbidden` 拒；这里再挡一道是
 *    因为画布执行在客户端，只锁服务端挡不住（§2.5 ②）。
 */

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_WRITE_MODES,
  isAssistantOperatorCanvasBatchTool,
  type AssistantOperatorCanvasTool,
} from '@/constants/assistant-operator'
import { NODE_ASSISTANT_PARAM_IDS } from '@/constants/node-assistant-ops'
import {
  isNodeStudioReferenceRole,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_ID_PREFIXES,
  NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
  NODE_STUDIO_NODE_PLACEMENT,
} from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  CANVAS_OPERATOR_FIELD_IDS,
  buildCanvasOperatorChangeKey,
  type CanvasOperatorChangeKey,
  type CanvasOperatorField,
} from '@/constants/studio-assistant-operator'
import {
  VIDEO_RESOLUTIONS,
  type VideoResolution,
} from '@/constants/video-options'
import type { AssistantOperatorAppliedStep } from '@/types/assistant-operator'
import type { ScriptDoc } from '@/types/script-doc'
import type {
  NodeWorkflowEdge,
  NodeWorkflowGraphPatch,
  NodeWorkflowModelOption,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'
import { createDefaultNodeData } from '@/hooks/node/use-node-workflow'
import { canCarryGenerationParams } from '@/lib/node-assistant-context'
import { buildAssistantSetModelPatch } from '@/lib/node-assistant-op-patch'
import { buildDisplayNamePatch } from '@/lib/node-display-name'
import { markMediaAwaitingReview, rejectMedia } from '@/lib/node-media-review'
import { getNodePrimaryMediaUrl } from '@/lib/node-workflow-graph'
import {
  EMPTY_NODE_WORKFLOW_GRAPH_PATCH,
  type NodeWorkflowGraph,
} from '@/lib/node-workflow-graph-patch'
import { createWorkflowEdge } from '@/lib/node-workflow-script-doc'

/** 画布宿主要认的那十条 step（两读 + 八改）—— `AssistantOperatorAppliedStep` 按 `tool` 收窄。 */
export type CanvasOperatorAppliedStep = Extract<
  AssistantOperatorAppliedStep,
  { tool: AssistantOperatorCanvasTool }
>

/** 别名 → 真实节点 id。⚠ 只读视图；每次 `stage_nodes` 返回一张新表，⛔ 别原地改。 */
export type CanvasOperatorAliases = ReadonlyMap<string, string>

export interface CanvasOperatorApplyInput {
  /**
   * 真实 id 的来源 —— 注入以保持纯函数。宿主给的是 `useNodeWorkflow` 的
   * `createWorkflowId`（画布上一切 id 的唯一出处）；测试给一个可预测的计数器。
   */
  createId(
    prefix:
      | typeof NODE_STUDIO_ID_PREFIXES.node
      | typeof NODE_STUDIO_ID_PREFIXES.edge,
  ): string
  /** 审核时间戳（`rejectMedia` 的 reviewedAt / 待审队列的 markedAt）。本模块不读时钟。 */
  now(): string
  /**
   * `set_node_model` 的目录查表：载荷只有 modelId + optionId（K-3 成对），
   * 落进节点的 `NodeWorkflowModelSelection` 还要 adapterType / providerConfig /
   * apiKeyId —— 全部来自宿主那张 `useWorkflowModelOptions` 的表，⛔ 一个也不许是模型写的。
   */
  resolveModelOption(
    nodeType: NodeWorkflowNodeType,
    modelId: string,
    optionId: string,
  ): NodeWorkflowModelOption | null
  /**
   * 此刻这个项目的剧本文档（`update_script_doc` 的撤销本钱）。
   * ⚠ 注入而不是从 `graph` 读：`NodeWorkflowGraph` 只有 nodes / edges —— 剧本文档
   * 与它们平级住在项目状态里，把它塞进图的形状会污染每一个只关心节点的调用方。
   */
  readScriptDoc(): ScriptDoc | undefined
}

/** 落笔落不下去的理由 —— 每一条都是「服务端放行了、图上却对不上」的那种失败，⛔ 不静默。 */
export const CANVAS_OPERATOR_APPLY_REFUSAL_IDS = {
  /** 真实 id 不在图上（服务端快照与画布之间被人手删掉了）。 */
  unknownNode: 'unknownNode',
  /** 别名没登记过（那一步 `stage_nodes` 在本宿主没落成）。 */
  aliasUnresolved: 'aliasUnresolved',
  /** 目录里没有这条 (nodeType, modelId, optionId) 组合。 */
  unknownModel: 'unknownModel',
  /** 节点还没有主媒体，没东西可审。 */
  noMedia: 'noMedia',
  /** `approved` 助手写不了（§4.2 Q4）—— 服务端已拒，这里是第二道。 */
  approvedForbidden: 'approvedForbidden',
} as const

export type CanvasOperatorApplyRefusal =
  (typeof CANVAS_OPERATOR_APPLY_REFUSAL_IDS)[keyof typeof CANVAS_OPERATOR_APPLY_REFUSAL_IDS]

export type CanvasOperatorApplyOutcome =
  | {
      readonly kind: 'patch'
      readonly tool: AssistantOperatorCanvasTool
      readonly patch: NodeWorkflowGraphPatch
      readonly inverse: NodeWorkflowGraphPatch
      readonly aliases: CanvasOperatorAliases
      /** 一批 = 一个撤销步（`stage_nodes` / `connect_nodes`），撤销走「撤销这一批」那道门。 */
      readonly batch: boolean
      /** 登记簿粒度 `${nodeId}:${field}`（任务书 §三）。 */
      readonly changes: readonly CanvasOperatorChangeKey[]
    }
  /** 读类：服务端已从工作副本答过，图上没有东西可落 —— 与工作台 `read_state` 同一档。 */
  | { readonly kind: 'read'; readonly tool: AssistantOperatorCanvasTool }
  /**
   * `update_script_doc`（C3）—— **不是图补丁**。
   *
   * ⭐ 分成第三种结果而不是折进 `patch`：剧本文档不住在 `NodeWorkflowGraphPatch` 里
   * （那份补丁只有 nodes / edges / nodeData），而且写文档与把文档变成节点是**两件
   * 事**：后者会删孤儿节点（B4），必须经既有的投影确认门由用户按下
   * （`previewScriptDocProjection` → 确认 → `applyScriptDocToGraph`，与
   * `ScriptDocWorkspace` 逐字同一条路）。宿主据此写文档、算预览、挂起确认。
   * ⚠ `priorDoc` 是**撤销的本钱**：`undefined` = 改前这个项目没有文档，撤销就是
   * 把它删回没有（所以它与「宿主没算」不能用同一个值表达 —— 用 `hasPriorDoc` 分开）。
   */
  | {
      readonly kind: 'scriptDoc'
      readonly tool: typeof ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc
      readonly doc: ScriptDoc
      readonly priorDoc: ScriptDoc | undefined
    }
  | {
      readonly kind: 'refused'
      readonly tool: AssistantOperatorCanvasTool
      readonly reason: CanvasOperatorApplyRefusal
      readonly ref: string
    }

export function isCanvasAlias(ref: string): boolean {
  return ref.startsWith(ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX)
}

/** 别名或真实 id → 图上的节点。查不到分两个理由（与服务端 `lookupCanvasNode` 同一对）。 */
function resolveNode(
  graph: NodeWorkflowGraph,
  aliases: CanvasOperatorAliases,
  ref: string,
): NodeWorkflowNode | CanvasOperatorApplyRefusal {
  const id = isCanvasAlias(ref) ? aliases.get(ref) : ref
  if (id === undefined) return CANVAS_OPERATOR_APPLY_REFUSAL_IDS.aliasUnresolved
  return (
    graph.nodes.find((node) => node.id === id) ??
    CANVAS_OPERATOR_APPLY_REFUSAL_IDS.unknownNode
  )
}

function isRefusal(
  value: NodeWorkflowNode | CanvasOperatorApplyRefusal,
): value is CanvasOperatorApplyRefusal {
  return typeof value === 'string'
}

function refused(
  tool: AssistantOperatorCanvasTool,
  reason: CanvasOperatorApplyRefusal,
  ref: string,
): CanvasOperatorApplyOutcome {
  return { kind: 'refused', tool, reason, ref }
}

/**
 * 逆补丁的 data 一半：**正向补丁动到的每个键，记下它此刻的值**（缺席 = `undefined`，
 * 施加时删键）。一条规则覆盖八条工具 —— 比逐工具手写「改前值」少八处会漂的地方。
 */
function inverseNodeData(
  node: NodeWorkflowNode,
  forward: Partial<NodeWorkflowNodeData>,
): Partial<NodeWorkflowNodeData> {
  const previous: Record<string, unknown> = {}
  for (const key of Object.keys(forward)) previous[key] = node.data[key]
  return previous as Partial<NodeWorkflowNodeData>
}

function dataPatch(
  nodeId: string,
  data: Partial<NodeWorkflowNodeData>,
): NodeWorkflowGraphPatch {
  return { ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH, nodeData: [{ nodeId, data }] }
}

function toVideoResolution(value: string): VideoResolution | undefined {
  return (VIDEO_RESOLUTIONS as readonly string[]).includes(value)
    ? (value as VideoResolution)
    : undefined
}

/**
 * 一条档位写入 → data 补丁（与 `buildAssistantSetParamsPatch` 同一套落点：
 * `duration` 在 data 上是字符串，`seed` 是数字，`generateAudio` 是布尔）。
 * 值域由服务端按当前模型的档位表判过；这里只做类型收窄，收不窄就不落。
 */
function paramPatch(
  key: string,
  value: string | number | boolean,
): Partial<NodeWorkflowNodeData> {
  switch (key) {
    case NODE_ASSISTANT_PARAM_IDS.aspectRatio:
      return typeof value === 'string' ? { aspectRatio: value } : {}
    case NODE_ASSISTANT_PARAM_IDS.resolution: {
      const resolution =
        typeof value === 'string' ? toVideoResolution(value) : undefined
      return resolution ? { resolution } : {}
    }
    case NODE_ASSISTANT_PARAM_IDS.duration:
      return { duration: String(value) }
    case NODE_ASSISTANT_PARAM_IDS.generateAudio:
      return typeof value === 'boolean' ? { generateAudio: value } : {}
    case NODE_ASSISTANT_PARAM_IDS.seed:
      return typeof value === 'number' ? { seed: value } : {}
    default:
      return {}
  }
}

function isParamKey(key: string): boolean {
  return (
    Object.values(NODE_ASSISTANT_PARAM_IDS) as readonly string[]
  ).includes(key)
}

/**
 * 整批落在现有图右侧、再按网格铺开 —— 逐字照抄旧执行块的落位（固定落点会直接
 * 压在已有节点上）。批内按序号排格子，⛔ 不读「已有节点数」（同一批里它不变）。
 */
function stagePosition(
  graph: NodeWorkflowGraph,
  seq: number,
): { x: number; y: number } {
  const { assistantSpawn, topbarAddPosition } = NODE_STUDIO_NODE_PLACEMENT
  const anchor =
    graph.nodes.length === 0
      ? topbarAddPosition
      : {
          x:
            Math.max(...graph.nodes.map((node) => node.position.x)) +
            assistantSpawn.anchorGapX,
          y: Math.min(...graph.nodes.map((node) => node.position.y)),
        }
  return {
    x: anchor.x + (seq % assistantSpawn.columns) * assistantSpawn.columnOffsetX,
    y:
      anchor.y +
      Math.floor(seq / assistantSpawn.columns) * assistantSpawn.rowOffsetY,
  }
}

/**
 * 建一个节点 —— 形状与 `useNodeWorkflow.addNode` + `createCanvasObject` 的 role
 * 盖章逐字一致（默认 data → role 族默认 data → role → 显示名 → 助手写的字段）。
 */
function buildStagedNode(
  id: string,
  item: {
    type: NodeWorkflowNodeType
    role?: NodeImageRole
    title?: string
    fields?: Record<string, string>
  },
  position: { x: number; y: number },
): NodeWorkflowNode {
  const identity = { role: item.role, type: item.type }
  const data: NodeWorkflowNodeData = {
    ...createDefaultNodeData(item.type),
    ...(item.role
      ? {
          ...createDefaultNodeData(NODE_IMAGE_ROLE_TO_LEGACY_TYPE[item.role]),
          role: item.role,
        }
      : {}),
    ...(item.title ? buildDisplayNamePatch(identity, item.title) : {}),
    ...(item.fields ?? {}),
  }
  // `videoReference` 仍带角把手，建时要给显式尺寸（与 `addNode` 同一条注释）。
  const needsExplicitSize = item.type === NODE_TYPE_IDS.videoReference
  return {
    id,
    type: item.type,
    position,
    data,
    ...(needsExplicitSize
      ? {
          width: NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
          height: NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
        }
      : {}),
  }
}

/**
 * 应用一步。返回 `{ patch, inverse, aliases }`（改动型）/ 读类 / 归 C3 / 落不下去。
 *
 * ⚠ `graph` 必须是**此刻**的图（宿主从 `readState()` 现读，不是 render 快照）：
 * 同一轮里上一步刚建的节点这一步要连线，读旧快照会查不到（旧执行块的台账 K-2）。
 */
export function applyCanvasOperatorStep(
  graph: NodeWorkflowGraph,
  step: CanvasOperatorAppliedStep,
  aliases: CanvasOperatorAliases,
  input: CanvasOperatorApplyInput,
): CanvasOperatorApplyOutcome {
  switch (step.tool) {
    case ASSISTANT_OPERATOR_TOOL_IDS.readGraph:
    case ASSISTANT_OPERATOR_TOOL_IDS.readNode:
      return { kind: 'read', tool: step.tool }

    /**
     * 写文档，⛔ 不投影。逆操作用**此刻宿主手上那份**（`input.readScriptDoc()`）
     * 而不是 `step.inverse.doc`：服务端的逆操作说的是它工作副本上的改前值，
     * 真正要撤回去的是这台机器上此刻的那一份（与本文件头注「inverse 在客户端自己算」
     * 逐字同一条论据）。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc:
      return {
        kind: 'scriptDoc',
        tool: step.tool,
        doc: step.payload.doc,
        priorDoc: input.readScriptDoc(),
      }

    case ASSISTANT_OPERATOR_TOOL_IDS.stageNodes: {
      const nextAliases = new Map(aliases)
      const addNodes: NodeWorkflowNode[] = []
      step.payload.items.forEach((item, seq) => {
        const id = input.createId(NODE_STUDIO_ID_PREFIXES.node)
        nextAliases.set(item.alias, id)
        addNodes.push(buildStagedNode(id, item, stagePosition(graph, seq)))
      })
      const firstId = addNodes[0]?.id ?? ''
      return {
        kind: 'patch',
        tool: step.tool,
        patch: { ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH, addNodes },
        inverse: {
          ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH,
          removeNodeIds: addNodes.map((node) => node.id),
        },
        aliases: nextAliases,
        batch: true,
        changes: [
          buildCanvasOperatorChangeKey(
            firstId,
            CANVAS_OPERATOR_FIELD_IDS.nodes,
          ),
        ],
      }
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.connectNodes: {
      const addEdges: NodeWorkflowEdge[] = []
      for (const item of step.payload.items) {
        const source = resolveNode(graph, aliases, item.source)
        if (isRefusal(source)) return refused(step.tool, source, item.source)
        const target = resolveNode(graph, aliases, item.target)
        if (isRefusal(target)) return refused(step.tool, target, item.target)
        // 服务端按工作副本判过「已连」；这里再按此刻的图判一次是幂等，不是复查。
        const connected =
          graph.edges.some(
            (edge) => edge.source === source.id && edge.target === target.id,
          ) ||
          addEdges.some(
            (edge) => edge.source === source.id && edge.target === target.id,
          )
        if (connected) continue
        addEdges.push(
          createWorkflowEdge(
            input.createId(NODE_STUDIO_ID_PREFIXES.edge),
            source.id,
            target.id,
          ),
        )
      }
      const firstId = addEdges[0]?.source ?? ''
      return {
        kind: 'patch',
        tool: step.tool,
        patch: { ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH, addEdges },
        inverse: {
          ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH,
          removeEdgeIds: addEdges.map((edge) => edge.id),
        },
        aliases,
        batch: true,
        changes: [
          buildCanvasOperatorChangeKey(
            firstId,
            CANVAS_OPERATOR_FIELD_IDS.edges,
          ),
        ],
      }
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields: {
      const forward: { nodeId: string; data: Partial<NodeWorkflowNodeData> }[] =
        []
      const inverse: { nodeId: string; data: Partial<NodeWorkflowNodeData> }[] =
        []
      const changes: CanvasOperatorChangeKey[] = []
      for (const item of step.payload.items) {
        const node = resolveNode(graph, aliases, item.nodeId)
        if (isRefusal(node)) return refused(step.tool, node, item.nodeId)
        const identity = { role: node.data.role, type: node.type }
        let data: Partial<NodeWorkflowNodeData> = {}
        for (const [key, value] of Object.entries(item.fields)) {
          if (key === CANVAS_OPERATOR_FIELD_IDS.title) {
            data = {
              ...data,
              ...buildDisplayNamePatch(identity, String(value)),
            }
          } else if (isParamKey(key) && canCarryGenerationParams(node)) {
            data = { ...data, ...paramPatch(key, value) }
          } else if (key === CANVAS_OPERATOR_FIELD_IDS.imageCategory) {
            // ⚠ `isNodeStudioReferenceRole` 不是复查，是让 TS 拿到窄类型（收窄发生在
            //    服务端规划器）。换成任何预设分类都要顺手清掉旧的自定义名（与人手那
            //    两处写者同形）。
            const category = String(value)
            if (!isNodeStudioReferenceRole(category)) continue
            data = {
              ...data,
              imageCategory: category,
              imageCategoryLabel: undefined,
            }
          } else {
            // 自由文本：追加用**协议里那个分隔符**（服务端算 inverse 与 observation
            // 用的就是它）；空框视同替换（C0-b 默认 4）。
            const current =
              typeof node.data[key] === 'string'
                ? (node.data[key] as string)
                : ''
            const next =
              item.mode === ASSISTANT_OPERATOR_WRITE_MODES.append &&
              current.trim()
                ? `${current}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${String(value)}`
                : String(value)
            data = { ...data, [key]: next }
          }
          changes.push(
            buildCanvasOperatorChangeKey(node.id, key as CanvasOperatorField),
          )
        }
        forward.push({ nodeId: node.id, data })
        inverse.push({ nodeId: node.id, data: inverseNodeData(node, data) })
      }
      return {
        kind: 'patch',
        tool: step.tool,
        patch: { ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH, nodeData: forward },
        inverse: { ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH, nodeData: inverse },
        aliases,
        batch: false,
        changes,
      }
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel: {
      const node = resolveNode(graph, aliases, step.payload.nodeId)
      if (isRefusal(node)) return refused(step.tool, node, step.payload.nodeId)
      const option = input.resolveModelOption(
        node.type,
        step.payload.modelId,
        step.payload.optionId,
      )
      if (!option) {
        return refused(
          step.tool,
          CANVAS_OPERATOR_APPLY_REFUSAL_IDS.unknownModel,
          step.payload.optionId,
        )
      }
      const data = buildAssistantSetModelPatch(option)
      return {
        kind: 'patch',
        tool: step.tool,
        patch: dataPatch(node.id, data),
        inverse: dataPatch(node.id, inverseNodeData(node, data)),
        aliases,
        batch: false,
        changes: [
          buildCanvasOperatorChangeKey(
            node.id,
            CANVAS_OPERATOR_FIELD_IDS.model,
          ),
        ],
      }
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.attachRefs: {
      const node = resolveNode(graph, aliases, step.payload.nodeId)
      if (isRefusal(node)) return refused(step.tool, node, step.payload.nodeId)
      // 条目形状与 `createReferenceAsset` 同形（默认权重同一个常量），id 用服务端
      // 分配的那个 —— 它的 `inverse.refIds` 就是按这些 id 摘。
      const attached: NodeWorkflowReferenceAsset[] = step.payload.refs.map(
        (ref) => ({
          id: ref.id,
          url: ref.url,
          role: ref.role,
          weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
          source: ref.source,
          ...(ref.sourceId ? { sourceId: ref.sourceId } : {}),
          ...(ref.name ? { name: ref.name } : {}),
        }),
      )
      const data: Partial<NodeWorkflowNodeData> = {
        referenceAssets: [...(node.data.referenceAssets ?? []), ...attached],
      }
      return {
        kind: 'patch',
        tool: step.tool,
        patch: dataPatch(node.id, data),
        inverse: dataPatch(node.id, inverseNodeData(node, data)),
        aliases,
        batch: false,
        changes: [
          buildCanvasOperatorChangeKey(
            node.id,
            CANVAS_OPERATOR_FIELD_IDS.references,
          ),
        ],
      }
    }

    case ASSISTANT_OPERATOR_TOOL_IDS.setReviewState: {
      const node = resolveNode(graph, aliases, step.payload.nodeId)
      if (isRefusal(node)) return refused(step.tool, node, step.payload.nodeId)
      if (step.payload.state === NODE_REVIEW_STATE_IDS.approved) {
        return refused(
          step.tool,
          CANVAS_OPERATOR_APPLY_REFUSAL_IDS.approvedForbidden,
          node.id,
        )
      }
      const url = getNodePrimaryMediaUrl(node.data)
      if (!url) {
        return refused(
          step.tool,
          CANVAS_OPERATOR_APPLY_REFUSAL_IDS.noMedia,
          node.id,
        )
      }
      const stamp = input.now()
      const data =
        step.payload.state === NODE_REVIEW_STATE_IDS.rejected
          ? rejectMedia(node.data, url, {
              reviewedAt: stamp,
              ...(step.payload.reason ? { reason: step.payload.reason } : {}),
            })
          : markMediaAwaitingReview(node.data, url, { markedAt: stamp })
      return {
        kind: 'patch',
        tool: step.tool,
        patch: dataPatch(node.id, data),
        inverse: dataPatch(node.id, inverseNodeData(node, data)),
        aliases,
        batch: false,
        changes: [
          buildCanvasOperatorChangeKey(
            node.id,
            CANVAS_OPERATOR_FIELD_IDS.reviewState,
          ),
        ],
      }
    }

    /**
     * 与 `prime_generate` 同一条宪法：只让**那个节点**的生成键亮起来
     * （`data.assistantPrimed`，读侧是节点卡的生成键），⛔ 不算价、不发任何请求。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate: {
      const node = resolveNode(graph, aliases, step.payload.nodeId)
      if (isRefusal(node)) return refused(step.tool, node, step.payload.nodeId)
      const data: Partial<NodeWorkflowNodeData> = { assistantPrimed: true }
      return {
        kind: 'patch',
        tool: step.tool,
        patch: dataPatch(node.id, data),
        inverse: dataPatch(node.id, inverseNodeData(node, data)),
        aliases,
        batch: false,
        changes: [
          buildCanvasOperatorChangeKey(
            node.id,
            CANVAS_OPERATOR_FIELD_IDS.primed,
          ),
        ],
      }
    }
  }
}

/** 这一步撤销走不走「撤销这一批」那道门 —— 与 `CanvasOperatorApplyOutcome.batch` 同一个判据。 */
export function isCanvasOperatorBatchStep(
  step: Pick<CanvasOperatorAppliedStep, 'tool'>,
): boolean {
  return isAssistantOperatorCanvasBatchTool(step.tool)
}
