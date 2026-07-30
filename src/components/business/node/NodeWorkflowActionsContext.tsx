'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type {
  NodeImageRole,
  NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeStudioToolMode } from '@/constants/node-studio'
import type { ScriptDocDepth, ScriptDocStage } from '@/constants/script-doc'
import type { NodeWorkflowActions } from '@/hooks/node/use-node-workflow'
import type { GenerateComposerSendInput } from '@/hooks/node/use-generate-composer'
import type {
  NodeWorkflowModelOptionsByType,
  NodeWorkflowNode,
  VideoDefaultModel,
} from '@/types/node-workflow'

/** A backfilled reference to autospawn upstream of a video node (§7.1): an
 *  already-resolved media asset (uploaded or picked from the library) that
 *  becomes a new source node, auto-wired into the target. */
export interface SpawnReferenceInput {
  /** The video (seedance) node the new reference feeds into. */
  targetNodeId: string
  /** The source node type to create: `image` / `voice` / `videoReference`. */
  nodeType: NodeWorkflowNodeType
  /** Image role (character / background / shot) — required for `image`, so the
   *  role-less unified image node is stamped with the department the user
   *  added it under. */
  role?: NodeImageRole
  /** The resolved media the new node carries. */
  media: {
    url: string
    /** Backing generation id, when the asset came from the library. */
    generationId?: string
    /** Poster for a video reference (§9). */
    thumbnailUrl?: string
    /** User-facing name / source label (defaults applied downstream). */
    name?: string
  }
}

export interface NodeWorkflowCanvasActions extends NodeWorkflowActions {
  generateCharacterImage?(nodeId: string): Promise<void>
  generateMediaNode?(nodeId: string): Promise<void>
  /**
   * AI-enhance a video (Seedance) node's prompt in place: reads the node's
   * current prompt + upstream references, runs the seedance-prompt-plan
   * planner (assistant's auto LLM route), and writes the orchestrated
   * finalPrompt / motion / camera / duration / timeline back onto the same
   * node. This is the home of the retired Agent node's `seedancePrompt` mode.
   */
  enhanceSeedancePrompt?(nodeId: string): Promise<void>
  focusGeneratedNodes?(): void
  /** Select + fitView to a single node — used by the video composer's
   *  reference token hover preview ("点击定位到画布对应节点", §8.3). */
  focusNode?(nodeId: string): void
  /** Existing canvas nodes that can legally connect into `targetNodeId`. */
  listConnectableReferences?(targetNodeId: string): NodeWorkflowNode[]
  /** Revalidate and connect one existing canvas node into a target node. */
  connectReferenceNode?(sourceNodeId: string, targetNodeId: string): void
  /** Autospawn an upstream reference node from a resolved asset and wire it
   *  into `targetNodeId` (§7.1 部门条 ＋添加位). Creates the node, stamps its
   *  role/media, and connects it — one high-level op so the composer never
   *  touches raw addNode/onConnect. Returns the new node id. */
  spawnReference?(input: SpawnReferenceInput): string
  /**
   * Removes a reference from a character/background node's nested
   * `referenceAssets`. A legacy `source:'canvas'` entry whose origin node
   * still exists only removes the nested copy; every real node now remains
   * visible in place. If the origin no longer exists, materialize a new loose
   * image from the preserved URL.
   */
  extractReference?(nodeId: string, referenceId: string): void
  toolMode: NodeStudioToolMode
  setToolMode(mode: NodeStudioToolMode): void
  /**
   * The node whose ⤢ detail panel is open, or null. Lifted to the workbench
   * so a single shared floating panel renders the one expanded node — nodes
   * (rendered by ReactFlow `nodeTypes`, no props) read/set it through context.
   */
  expandedNodeId: string | null
  setExpandedNodeId(id: string | null): void
  /**
   * R3-4 (canvas-relationship-v3 §4.2 rule 3): true while 档2（详情面板）or
   * 档3（重编辑工作区 / 剧本笺展开）is open. Node-local L3 chrome (the loose
   * image quick-edit panel today) watches this to close itself — the source
   * of truth for "is a heavy overlay open" lives in the workbench, but the
   * L3 panels it needs to reach into stay owned by their own node component.
   */
  heavyOverlayOpen: boolean
  /**
   * CanvasImageEditWorkspace (档3 重编辑工作区, Radix Dialog) reports its own
   * open/close here so the workbench can fold it into `heavyOverlayOpen` and
   * the L5 close cascade — the dialog's `activeTask` state stays local to
   * `CanvasImageSelectionToolbar`, this is a one-way mirror, not a lift.
   */
  setImageEditWorkspaceOpen(open: boolean): void
  /**
   * R3-4 (canvas-relationship-v3 §4.2 rule 1): true while an L5 citizen
   * (添加菜单 / CastDock 展开浮层——后者只在卡匣走浮层族布局时才可能为真，
   * S2b 之后的生产布局是左侧常驻面板，恒 false) is open. Distinct from
   * `heavyOverlayOpen`
   * (which is 档2/档3 only) — this is the lighter "a transient layer just
   * claimed the slot" signal, watched by the same node-local L3 chrome
   * (loose image quick-edit panel) so opening the add menu or the cast strip
   * tucks away a stray near-field panel instead of leaving two floaty things
   * open over the canvas at once.
   */
  transientLayerOpen: boolean
  /**
   * R3-7 (canvas-relationship-v3 §7 red line: "多选时不出现单节点工具条与合成
   * 条打架"): true whenever 2+ nodes are selected. React Flow's own
   * `NodeToolbar` auto-hides on multi-select ONLY when `isVisible` is left
   * unset — every per-node toolbar in this codebase passes an explicit
   * `isVisible={Boolean(selected)}`, which bypasses that library default, so
   * the workbench derives the same signal here and every node-local toolbar
   * ANDs it in. Source of truth: `workflow.nodes[].selected` (same signature-
   * gated Set the R3-1 edge-reveal logic already built), not a second
   * selection store. Optional (not required) so the existing test-only
   * context mocks (CharacterImageInspector.test.tsx / NodeMediaInspector.
   * test.tsx) don't need updating — `undefined` reads as "not multi-
   * selecting", the exact pre-R3-7 behavior.
   */
  multiSelectActive?: boolean
  /**
   * True while a canvas node is being dragged (ReactFlow 原生拖拽生命周期)。
   *
   * 2026-07-28 owner：「拖拽的时候上下两边的框不应该打开」——拖动一张卡时，卡
   * 上方的近场工具条与卡下方的生成提示词框都还挂着跟着跑，既遮挡落点又让人以为
   * 还能点。拖拽期间两者都收起。
   *
   * ⚠ 与 `multiSelectActive` 同属「这一层该不该露面」的判据，所以走同一条
   * context 通路，不另起一套。
   */
  canvasNodeDragActive?: boolean
  modelOptionsByType: NodeWorkflowModelOptionsByType
  /** Canvas-default video model (two-tier {brand,variant}); new video nodes
   *  inherit it via the autospawn effect. Set from the topbar chip. */
  defaultVideoModel: VideoDefaultModel | undefined
  /** Right-rail workspace UI state, persisted on the project so it survives a
   *  reload. The ScriptDoc workspace reads + writes these through the context. */
  scriptDocStage: ScriptDocStage | undefined
  scriptDocDepth: ScriptDocDepth | undefined
  scriptDocLocks: string[] | undefined
  /**
   * R3-8 (canvas-relationship-v3 §7 C1 场记条): the current project's display
   * name, read by the video detail body's slate strip. Optional so the
   * pre-existing test-only context mocks (VideoComposer.test.tsx and friends)
   * don't need updating — `undefined` reads as "omit the segment" (§2.6-style
   * honest omission), never a fabricated placeholder.
   */
  projectName?: string
  /**
   * 画布级粘贴（canvas-image-card.md §4.1）：粘贴瞬间要让新建的图片节点立刻
   * 进「上传中」态，但 `File` 对象没法塞进可持久化的 `node.data`（不可序列
   * 化，也不该进 undo/redo 历史）。这个函数是画布 paste 处理器（新建空节点
   * 那一刻）与该节点自己的 `ImageSourceStarter`（挂载那一刻）之间的一次性
   * 交接：workbench 端注册一份待处理 File，`ImageSourceStarter` 挂载时调用
   * 一次即消费清空，不重复触发、不残留。可选——测试用的 context mock（同
   * `projectName` 的先例）不必跟着补这个字段，`undefined` 时
   * `ImageSourceStarter` 就是没有待处理文件，走原来的空态，行为不变。
   */
  consumePendingPasteFile?(nodeId: string): File | undefined
  /**
   * canvas-generate-composer.md §0 与 §7.5 都没预见到的一处真实碰撞：
   * `LooseImageCard` 已经在 `Position.Bottom` 挂了一个 `CanvasQuickEditPrompt`
   * （近场工具条「快编」按钮点开），而生成提示词框同样要贴同一张卡的下方。
   * 两者互斥——快编是显式点开的次级能力，生成提示词框是选中即默认出现的主
   * 面；后者应该给前者让位，不是叠在同一块屏幕位置上。这个字段只记录「哪个
   * 节点的快编面板当前打开」，`GenerateComposer` 读它来隐藏自己；写入方只有
   * `LooseImageCard`。可选——没提供时按"没有快编面板打开"处理，行为不变。
   */
  quickEditNodeId?: string | null
  setQuickEditNodeId?(nodeId: string | null): void
  /**
   * canvas-generate-composer.md §7「结果落点」: creates/fills the target
   * image node(s), wires the source→result edge when there's a populated
   * host, seeds the generation input, runs it, and reselects the last
   * target — see `GenerateComposerSendInput`'s doc comment for the full
   * contract and why this can't be built from smaller primitives exposed on
   * this context (addNode/onConnect/onNodesChange live only on
   * `useNodeWorkflow`, which only `StudioNodeWorkbench` holds). Optional so
   * `GenerateComposer`'s own tests can mock it without satisfying the rest
   * of this large interface.
   */
  runGenerateComposer?(input: GenerateComposerSendInput): Promise<string[]>
}

const NodeWorkflowActionsContext =
  createContext<NodeWorkflowCanvasActions | null>(null)

interface NodeWorkflowActionsProviderProps {
  value: NodeWorkflowCanvasActions
  children: ReactNode
}

export function NodeWorkflowActionsProvider({
  value,
  children,
}: NodeWorkflowActionsProviderProps) {
  return (
    <NodeWorkflowActionsContext.Provider value={value}>
      {children}
    </NodeWorkflowActionsContext.Provider>
  )
}

export function useNodeWorkflowActions(): NodeWorkflowCanvasActions {
  const context = useContext(NodeWorkflowActionsContext)
  if (!context) {
    throw new Error('NodeWorkflowActionsProvider is missing')
  }

  return context
}
