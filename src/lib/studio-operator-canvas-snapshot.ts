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
 * ── ⛔ 为什么不把 URL 放进快照 ──────────────────────────────────────
 * 画布上的 op 一律认**节点 id**（`attach_asset` 的载荷里没有地址）。快照里摆
 * 一串地址只会诱导模型去写地址，而那正是它编一个不存在的 URL 的形状。
 * 所以产出这一格是 `hasOutput: boolean`。
 */

import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import { parseScriptShots } from '@/lib/node-script-shots'
import { readScriptShotRef } from '@/lib/node-script-projection'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorCanvasShot,
  AssistantOperatorCanvasSnapshot,
} from '@/types/assistant-operator'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/** 未归镜的散节点落在这一档（`shotNo` 缺席）。 */
const LOOSE_SHOT_TITLE = 'Unassigned'

/**
 * 一个节点上模型改得动的那几格。
 *
 * ⚠ 正文按 `maxNodeTextChars` 截断：一张剧本笺可以有十万字，而模型要的只是
 * 「这张卡在讲什么」。要全文就把焦点放上去再读一次。
 */
const MAX_NODE_TEXT_CHARS = 400

function nodeText(node: NodeV4): string | undefined {
  const data = node.data
  const raw = data.kind === NODE_MEDIA_KIND_IDS.text ? data.body : data.prompt
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  return trimmed.length > MAX_NODE_TEXT_CHARS
    ? `${trimmed.slice(0, MAX_NODE_TEXT_CHARS)}…`
    : trimmed
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
): AssistantOperatorCanvasNode {
  const data = node.data
  const text = nodeText(node)
  const model =
    data.kind === NODE_MEDIA_KIND_IDS.text ? undefined : data.model?.modelId
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
    id: node.id,
    position: node.position,
    ...(referenceImageIndex < 0 ? {} : { referenceImageIndex }),
    name: data.name,
    kind: data.kind,
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
    ...(model === undefined ? {} : { model }),
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
}

export function buildCanvasOperatorSnapshot({
  referenceUrls = [],
  nodes,
  edges,
  currentShotNo,
  selectedNodeIds = [],
  availableModelsByNodeId,
}: BuildCanvasSnapshotInput): AssistantOperatorCanvasSnapshot {
  const incomingByTarget = new Map<string, NodeWorkflowEdgeV4[]>()
  for (const edge of edges) {
    const list = incomingByTarget.get(edge.target)
    if (list) list.push(edge)
    else incomingByTarget.set(edge.target, [edge])
  }

  const scriptProjections = buildScriptProjectionSummaries(nodes)

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
    shots.push({
      expanded: true,
      shotNo,
      title,
      nodes: shotNodes
        .slice(0, ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot)
        .map((node) =>
          toSnapshotNode(
            node,
            incomingByTarget.get(node.id) ?? [],
            availableModelsByNodeId,
            scriptProjections,
            referenceUrls,
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
  }
}
