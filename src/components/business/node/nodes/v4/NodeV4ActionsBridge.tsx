'use client'

/**
 * 画布外壳的**唯一动作出口**（第三期 · 画布 C3c-③b「动作总线换轨」）。
 *
 * ── 为什么不是让外壳直接用 `NodeV4Context` ──────────────────────────────
 * `NodeV4CanvasContextValue` 是**节点卡片**的契约：它带着 `nodes` / `edges` /
 * `draggingFrom` / `expandedNodeId` 这些只有卡片才需要的整图读值，而且它的 Provider
 * （`NodeV4Provider`）挂在 ReactFlow 那一层 —— 卡匣、剧本工作区、助手 dock 都在它
 * **外面**。外壳要的从来只是「发一条动作」，不是「读整张图」。
 *
 * 所以这里是一层**薄出口**：只有动作，没有图。翻转前由 workbench 用
 * ③d-3 之前由一个适配器把 v3 的 `updateNodeData` 等包成这个形状；③d-4 翻转后改由
 * `NodeV4Provider` 一侧提供，13 个外壳组件一行不用改。
 *
 * ── 接口按 v4 op 语义写，⛔ 不按 v3 patch 语义写 ────────────────────────
 * 出口上**没有** `updateNodeData(id, patch)`：那是「往节点上盖一坨字段」，
 * 与 op 表的「一条语义动作 = 一个撤销步 + 一份 inverse」根本不是同一件事。想改
 * 状态就发 op（`applyOp`），op 表里没有的动作**去 op 表加**，⛔ 不从这里开一条
 * 绕过 op 的字段写入路径。
 *
 * 例外只有两类，且都有先例（`NodeV4Context.onSetMedia` 那条注释）：
 *   ① **运行态**（`setNodeRunState`）—— 生成/编辑跑起来的进度信号。进 op 表等于
 *      给每一次进度跳变产生一条撤销记录，而它本身不是用户的意图。
 *   ② **画布编排类**（`placeDerivedImages` / `spawnReference` / `focusNode`…）——
 *      要么只动相机不动图，要么是「建节点＋连线＋落图」的复合编排，其原语只住在
 *      workbench 手里。
 */

import { createContext, useContext, type ReactNode } from 'react'

import type { NodeReviewMode } from '@/hooks/node/use-node-review-mode'
import type { PlannedNodeAssistantOpV4 } from '@/lib/node-assistant-op-plan'
import type { CanvasDerivedImageOutput } from '@/types/canvas-image-edit'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeImageRole,
  NodeV4Subtype,
  NodeWorkflowMediaKind,
  NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { ScriptDocDepth, ScriptDocStage } from '@/constants/script-doc'
import type { ScriptDoc } from '@/types/script-doc'

/**
 * 一次剧本投影的账。
 *
 * ⚠ ③d-4 从 `use-node-workflow`（已删）搬来。它描述的是**投影的结果**，与 v3 的
 * `updateNodeData` 无关，翻转后要继续活着 —— 剧本工作区那句「新建 N / 保留 M」
 * 读的就是它。
 */
export interface ApplyScriptDocResult {
  /** 这次投影新建的节点数。 */
  created: number
  /** 已存在、且被剧本改写了字段的节点数。 */
  updated: number
  /** 已经有对应节点、原样保留的（幂等复用）。 */
  skipped: number
  /** 因为大纲里删掉了对应条目而移除的节点数。 */
  removed: number
  /** 因为大纲变了而移除的剧本托管边数。 */
  removedEdges: number
  refusal: 'noScriptDoc' | 'emptyScriptDoc' | null
}

/** 一批 op 实际执行完的账：给用户一句可信的回执，而不是「已应用」四个字。 */
export interface NodeAssistantOpRunResult {
  applied: number
  /** 执行时才失效的（引用的新节点被用户从这一批里剔掉了）。 */
  skipped: number
  /**
   * `skipped` 里**连线没建成**的那一部分（台账 K-2，2026-08-29 真机）。
   *
   * 单独拎出来是因为它与其余的 skipped 不是一回事：其余多半是用户自己剔掉了引用
   * 的节点（预期之内），而连线失败意味着**助手规划的图结构没成形** —— 4 个镜头
   * 文本与 4 个视频节点铺好了却一条都没连上，用户看到的画布是散的。回执里必须
   * 点名说出来，否则一个只会变大的「已落 N 个」恰恰盖住了它。
   */
  failedConnects: number
  createdNodeIds: string[]
}

/** A backfilled reference to autospawn upstream of a video node (§7.1). */
export interface SpawnReferenceInput {
  targetNodeId: string
  nodeType: NodeWorkflowNodeType
  /** Image role — 让无角色的统一 image 节点带上用户添加它的那个部门。 */
  role?: NodeImageRole
  media: {
    url: string
    generationId?: string
    thumbnailUrl?: string
    name?: string
  }
}

/**
 * 画布上**一张可取的图**。
 *
 * 只带渲染这一格需要的三样：图、名字、类型。⚠ 刻意**不返回整个节点** —— 返回节点
 * 的话调用方就得自己再解一次「主图是哪张、名字取哪个字段」，而那两件事各有一条既定
 * 链路，解两遍迟早分岔。
 */
export interface CanvasImageSource {
  nodeId: string
  url: string
  name?: string
  /**
   * 这张图是**哪一族**的（`image.character` / `image.shot` …）。
   *
   * ⚠ ③d-4：这一栏原来是 legacy 的 `NodeWorkflowNodeType`，翻转后图上根本不存在
   * 那套 type。改带 v4 的 `kind` + `subtype` 两截，⛔ 不套一层「v4 子型 → legacy
   * type」的换算：那正是给旧签名留垫片，而候选卡要的本来就是「角色 / 背景 / 镜头
   * 图」这个子型词，不是 12 个 legacy type 里的某一个。
   */
  kind: NodeWorkflowMediaKind
  subtype: NodeV4Subtype
}

/**
 * 生成 / 编辑的**运行态**三档。
 *
 * ⚠ 与节点上持久化的 `status` / `generationStatus` 是同一件事的两个名字，但出口
 * 只收这三档：调用方不该知道那两个字段各自该写哪个枚举值（v3 与 v4 的枚举并不
 * 相同），那是实现方的事。
 */
export const NODE_CANVAS_RUN_STATES = ['running', 'success', 'error'] as const

export type NodeCanvasRunState = (typeof NODE_CANVAS_RUN_STATES)[number]

/** 剧本笺工作区的状态与三个动作（右栏 workspace 独有，不属于图的 op）。 */
export interface NodeCanvasScriptDocActions {
  readonly stage: ScriptDocStage | undefined
  readonly depth: ScriptDocDepth | undefined
  readonly locks: string[] | undefined
  /** 分镜静帧开关。`undefined` = 默认开。 */
  readonly shotStills: boolean | undefined
  setStage(value: ScriptDocStage): void
  setDepth(value: ScriptDocDepth): void
  setLocks(value: string[]): void
  setShotStills(value: boolean): void
  setDoc(scriptDoc: ScriptDoc | undefined): void
  /** 投影进图。 */
  applyToGraph(): ApplyScriptDocResult
  /** 同一套计算但不提交 —— 「确认镜头」之前看得见将建/将更新/将移除。 */
  previewProjection(): ApplyScriptDocResult
}

export interface NodeCanvasActions {
  /**
   * **唯一的状态写入口**：把一条 v4 op 交给实现方的同一条路径
   * （翻转后 = `applyNodeAssistantOpV4` + 失败 toast）。
   */
  applyOp(op: NodeAssistantOpV4): Promise<void>
  /** 高亮并平移到一个节点（只动相机，不动图 —— 所以不是 op）。 */
  focusNode(nodeId: string): void
  /** 刚投影出来的那批节点入镜（剧本笺「确认镜头」之后）。 */
  focusGeneratedNodes(): void
  /** 撤销上一步（走 op inverse）。 */
  undo(): void
  /** 见 `NodeCanvasRunState` —— 运行态不进 op 表。 */
  setNodeRunState(nodeId: string, runState: NodeCanvasRunState): void
  /**
   * 落一批非破坏性图片编辑的产物为派生节点，返回新节点 id。
   * 复合编排（建节点＋连线＋落图＋选中），原语只住在 workbench。
   */
  placeDerivedImages(
    sourceNodeId: string,
    outputs: readonly CanvasDerivedImageOutput[],
  ): string[]
  /** 从一份已解析的素材自动新建上游参考节点并接进目标。`null` = 被容量闸拒了。 */
  spawnReference(input: SpawnReferenceInput): string | null
  /** 画布上**已经有图可取**的节点。 */
  listCanvasImageSources(excludeNodeId: string): CanvasImageSource[]
  /**
   * 把画布上已有的一个节点接进目标。返回**「这个素材现在在不在目标的槽里」**，
   * 重复引用同样返回 `true` —— 调用方靠它决定要不要在正文里留 `@名字`。
   */
  connectReferenceNode(sourceNodeId: string, targetNodeId: string): boolean
  /**
   * 执行一批**已经规划过**的助手 op，返回实际发生了什么。
   *
   * ⚠ 整批一次落图 = **一个撤销条目**（§7 助手的一轮 = 一步撤销）：一次铺十个
   * 节点要按十次撤销才回得来，那不是用户点「应用」时的意图。
   */
  runAssistantOps(
    ops: readonly PlannedNodeAssistantOpV4[],
  ): Promise<NodeAssistantOpRunResult>
  /** 显式审阅模式的全部状态与推进动作。`undefined` = 没有审阅模式。 */
  readonly reviewMode: NodeReviewMode | undefined
  /**
   * 审阅里的「打回 → 改词再来」。
   *
   * ⚠ 它**不是**普通生成的别名：这一次按**助手发起**算，结果重新回到待审队列。
   */
  regenerateForReview(nodeId: string, promptAppend?: string): Promise<void>
  readonly scriptDoc: NodeCanvasScriptDocActions
}

const NodeCanvasActionsContext = createContext<NodeCanvasActions | null>(null)

export function NodeCanvasActionsProvider({
  value,
  children,
}: {
  value: NodeCanvasActions
  children: ReactNode
}) {
  return (
    <NodeCanvasActionsContext.Provider value={value}>
      {children}
    </NodeCanvasActionsContext.Provider>
  )
}

/**
 * ⚠ 缺 provider 时**抛错**，不给空默认值：空默认值会让按钮点下去悄无声息，
 * 而那正是最难查的一类画布 bug（`useNodeV4Canvas` 同一条论据）。
 */
export function useNodeCanvasActions(): NodeCanvasActions {
  const value = useContext(NodeCanvasActionsContext)
  if (!value) {
    throw new Error(
      'useNodeCanvasActions must be used inside <NodeCanvasActionsProvider>',
    )
  }
  return value
}
