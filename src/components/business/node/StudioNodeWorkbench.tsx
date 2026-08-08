'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useStoreApi,
  type Connection,
  type DefaultEdgeOptions,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type XYPosition,
} from '@xyflow/react'
import { useAuth } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  getCanvasAddCatalogItem,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import {
  NODE_STUDIO_BOTTOM_DOCK,
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_DOCK,
  NODE_STUDIO_EDGE_VISUALS,
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_INGEST_REJECT_REASON_IDS,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
  NODE_STUDIO_REFERENCE_SOURCE_IDS,
  NODE_STUDIO_TOOL_MODE_IDS,
  NODE_STUDIO_VIDEO_REFERENCE_LEGEND,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_SOURCE_IDS,
  NODE_GENERATION_STATUS_IDS,
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeGenerationSource,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_ASSISTANT_OP_IDS } from '@/constants/node-assistant-ops'
import { DEFAULT_ASPECT_RATIO } from '@/constants/config'
import { INGEST_MOTION, NODE_EDGE_SIGNING_MOTION } from '@/constants/motion'
import { DEFAULT_SCRIPT_PLANNER_PROVIDER } from '@/constants/script-breakdown'
import { AUDIO_EMOTIONS, type AudioEmotion } from '@/constants/voice-cards'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { useCharacterImageGeneration } from '@/hooks/cards/use-character-image-generation'
import { useSeedancePromptPlan } from '@/hooks/prompts/use-seedance-prompt-plan'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import {
  computeSpawnPosition,
  type GenerateComposerSendInput,
} from '@/hooks/node/use-generate-composer'
import { useNodeGenerationReconcile } from '@/hooks/node/use-node-generation-reconcile'
import { useNodeMediaGeneration } from '@/hooks/node/use-node-media-generation'
import {
  useNodeReviewMode,
  type NodeReviewMode,
} from '@/hooks/node/use-node-review-mode'
import {
  applyBiteHover,
  clearBiteHover,
  evaluateCastIngest,
  findNodeCardElement,
  findNodeWrapperElement,
  playNodeBounceBack,
  playTargetRejectShakeAnimation,
  playTargetSigningSettleAnimation,
  prefersReducedMotion,
  type CastIngestEvaluation,
} from '@/hooks/node/use-cast-ingest'
import { useCanvasImageDrop } from '@/hooks/node/use-canvas-image-drop'
import {
  createDefaultNodeData,
  useNodeWorkflow,
} from '@/hooks/node/use-node-workflow'
import { useOverlayFocusReturn } from '@/hooks/node/use-overlay-focus-return'
import {
  useUpdateNodeInternalsOnInit,
  type ForceNodeInternalsUpdate,
} from '@/hooks/node/use-update-node-internals-on-init'
import { useWorkflowModelOptions } from '@/hooks/use-workflow-model-options'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'
import { markMediaAwaitingReview, rejectMedia } from '@/lib/node-media-review'
import {
  buildDisplayNamePatch,
  stripFileExtension,
} from '@/lib/node-display-name'
import type {
  NodeAssistantOpNodeRef,
  PlannedNodeAssistantOp,
} from '@/lib/node-assistant-op-plan'
import {
  decideCanvasImageEditHandoffSession,
  getCanvasImageEditHandoffRequestKey,
  readCanvasImageEditHandoff,
  resolveCanvasImageEditHandoff,
} from '@/lib/canvas-image-edit-handoff'
import {
  buildReferenceAssetLegendEntries,
  buildShotReferenceLegend,
  buildVideoReferenceLegend,
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  harvestUpstreamCloseupUrls,
  harvestUpstreamImageReferences,
  harvestUpstreamImageUrls,
  harvestUpstreamShotTextPrompt,
  harvestUpstreamVideoImageReferences,
  harvestUpstreamVideoUrls,
  isShotNode,
  mergePromptWithUpstreamText,
  summarizeUpstreamSeedanceReferences,
  type UpstreamImageReference,
  type VideoLegendImageReference,
} from '@/lib/node-workflow-graph'
import {
  filterReferencedImages,
  translatePromptTokensToPositional,
} from '@/lib/node-video-prompt-translation'
import { buildVideoSendPreview } from '@/lib/node-video-send-preview'
import { assembleReferenceImagePayload } from '@/lib/node-reference-payload'
import type { AdvancedParams } from '@/types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import {
  clearStudioNodeResult,
  readStudioNodeResult,
} from '@/lib/studio-node-handoff'
import { getNodeModeForModel } from '@/constants/video-node-modes'
import { resolveVideoModelForMode } from '@/lib/video-node-model-resolver'
import { canConnectNodeTypes } from '@/lib/node-connection-rules'
import {
  edgePairKey,
  NODE_EDGE_TIER_IDS,
  resolveNodeEdgeTier,
  resolveNodeEdgeVisibility,
} from '@/lib/node-edge-tier'
import { isNodeWorkflowGenerating } from '@/lib/node-workflow-edge-visual'
import { cn } from '@/lib/utils'
import {
  canComposeVideoMergeSelection,
  sortNodesForVideoMergeCompose,
} from '@/lib/node-video-merge-compose'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { CanvasAddMenu } from './CanvasAddMenu'
import { CanvasBottomDock } from './CanvasBottomDock'
import { CanvasMiniMap } from './CanvasMiniMap'
import { CanvasStartupSkeleton } from './CanvasStartupSkeleton'
import { CanvasSurface, getCanvasAppearanceCssVars } from './CanvasSurface'
import { CanvasTopBar } from './CanvasTopBar'
import { CanvasWorkspaceLayout } from './CanvasWorkspaceLayout'
import {
  CanvasLeftPanel,
  CANVAS_LEFT_PANEL_VIEW_IDS,
  type CanvasLeftPanelView,
} from './CanvasLeftPanel'
import { CanvasProjectPanel } from './CanvasProjectPanel'
import { CastDock, countCanvasNodes } from './CastDock'
import { GenerateComposer } from './composer/GenerateComposer'
import { IngestDragProvider, type QuickThrowApi } from './IngestDragLayer'
import { NodeCanvasEmptyGuide } from './NodeCanvasEmptyGuide'
import {
  NodeWorkflowActionsProvider,
  type NodeAssistantOpRunResult,
  type SpawnReferenceInput,
} from './NodeWorkflowActionsContext'
import { ProjectNameDialog } from './ProjectNameDialog'
import { ReviewModeBar } from './ReviewModeBar'
import { StudioNodeAssistantDock } from './StudioNodeAssistantDock'
import { VideoMergeComposeToolbar } from './VideoMergeComposeToolbar'
import { NodeDetailPanel } from './node-detail/NodeDetailPanel'
import { BackgroundImageNode } from './nodes/BackgroundImageNode'
import { CharacterImageNode } from './nodes/CharacterImageNode'
import { FrameImageNode } from './nodes/FrameImageNode'
import { ImageNode } from './nodes/ImageNode'
import { SeedanceNode } from './nodes/SeedanceNode'
import { ShotNode } from './nodes/ShotNode'
import { ShotTextNode } from './nodes/ShotTextNode'
import { VideoMergeNode } from './nodes/VideoMergeNode'
import { VideoReferenceNode } from './nodes/VideoReferenceNode'
import { VoiceNode } from './nodes/VoiceNode'
import { NodeWorkflowStatusEdge } from './edges/NodeWorkflowStatusEdge'

// ⛔ 不注册 composer / agent：旧 planner 的组件已于 2026-08-02 删除。它们的
// 节点在两条水化路径上都会被 `migrateRetirePlanner` 先剥掉，所以这里永远不会
// 被查到 —— 实拍验证过（夹具注入两个节点，画布显示「0 个节点」）。
// ⚠ enum 值与那份迁移都必须保留，理由写在 `NODE_TYPE_IDS` 定义处。
const NODE_COMPONENTS: NodeTypes = {
  [NODE_TYPE_IDS.shotText]: ShotTextNode,
  [NODE_TYPE_IDS.shot]: ShotNode,
  [NODE_TYPE_IDS.characterImage]: CharacterImageNode,
  [NODE_TYPE_IDS.backgroundImage]: BackgroundImageNode,
  [NODE_TYPE_IDS.frameImage]: FrameImageNode,
  [NODE_TYPE_IDS.image]: ImageNode,
  [NODE_TYPE_IDS.voice]: VoiceNode,
  [NODE_TYPE_IDS.seedance]: SeedanceNode,
  [NODE_TYPE_IDS.videoReference]: VideoReferenceNode,
  [NODE_TYPE_IDS.videoMerge]: VideoMergeNode,
}

// Override the built-in `smoothstep` so every canvas edge renders with the
// §2.3 four-state visual (default/hover/selected/running). All canvas edges use
// this type, so no per-edge type change or migration is needed.
const NODE_EDGE_COMPONENTS: EdgeTypes = {
  [NODE_STUDIO_EDGE_VISUALS.type]: NodeWorkflowStatusEdge,
}

const NODE_STUDIO_DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: NODE_STUDIO_EDGE_VISUALS.type,
  interactionWidth: NODE_STUDIO_EDGE_VISUALS.interactionWidth,
  markerEnd: {
    type: NODE_STUDIO_EDGE_VISUALS.markerEndType,
    color: NODE_STUDIO_EDGE_VISUALS.color,
    width: NODE_STUDIO_EDGE_VISUALS.markerSize,
    height: NODE_STUDIO_EDGE_VISUALS.markerSize,
    strokeWidth: NODE_STUDIO_EDGE_VISUALS.markerStrokeWidth,
  },
  style: {
    stroke: NODE_STUDIO_EDGE_VISUALS.color,
    strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
    filter: NODE_STUDIO_EDGE_VISUALS.glowFilter,
  },
}

const NODE_STUDIO_CONNECTION_LINE_STYLE = {
  stroke: NODE_STUDIO_EDGE_VISUALS.previewColor,
  strokeWidth: NODE_STUDIO_EDGE_VISUALS.previewStrokeWidth,
  strokeDasharray: NODE_STUDIO_EDGE_VISUALS.previewDash,
  filter: NODE_STUDIO_EDGE_VISUALS.glowFilter,
}

interface AddMenuState {
  menuPosition: XYPosition
  flowPosition: XYPosition
}

/**
 * S5f A「画布实体拖拽吞噬全覆盖」: a collector card — character/background,
 * legacy per-role type OR unified `image` with that role. The ONLY targets
 * the loose-image FUSION gesture (referenceAssets, no edge) below applies to;
 * every other legal (source→target) pair from here on rides the general
 * edge-based ingest path instead (`evaluateCastIngest` + `onConnect`). Also
 * doubles as row① source detection: this same card, native-canvas-dragged
 * onto a shot/video target, is the "只是移动" gap the task packet names.
 */
function isCollectorCardNode(node: NodeWorkflowNode): boolean {
  return (
    (node.type === NODE_TYPE_IDS.image &&
      (node.data.role === NODE_IMAGE_ROLE_IDS.character ||
        node.data.role === NODE_IMAGE_ROLE_IDS.background)) ||
    node.type === NODE_TYPE_IDS.characterImage ||
    node.type === NODE_TYPE_IDS.backgroundImage
  )
}

/** A role-less unified `image` node — 散图, §三.1's "合法稳态". */
function isLooseImageNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.image && !node.data.role
}

/**
 * S5f A: node types whose NATIVE canvas drag (plain ReactFlow
 * `nodesDraggable`, not the Cast-dock's own pointer-ghost engine) should
 * attempt an ingest gesture on drop — collector cards (row①), voice (row②),
 * videoReference (row③), and loose images (row④ fusion / row⑤ edge-ingest,
 * disambiguated by target type in the drop handler below). Every other node
 * type (shot/seedance/videoMerge/shotText/closeup/frame/…) is outside this
 * task packet's five-row scope and keeps plain-move behaviour, unchanged.
 */
function isCanvasIngestDragSource(node: NodeWorkflowNode): boolean {
  return (
    isCollectorCardNode(node) ||
    node.type === NODE_TYPE_IDS.voice ||
    node.type === NODE_TYPE_IDS.videoReference ||
    isLooseImageNode(node)
  )
}

/**
 * Native node dragging is position-only. The retired canvas-ingest gesture
 * remains in this file until its wider cleanup task removes the related
 * helpers, but every phase must share one gate so hover preview cannot keep
 * scaling a nearby card while drop handling is disabled.
 */
const CANVAS_INGEST_DRAG_GESTURE_ENABLED: boolean = false

interface CanvasDragHit {
  targetNodeId: string
  cardElement: HTMLElement
}

/**
 * Stacked `elementsFromPoint` scan (S5c 三.3, S5d 命中检测升级) shared by
 * every native-canvas-node-drag gesture below — topmost element first, so the
 * DRAGGED node's own raised-z-index wrapper never shadows the drop target
 * underneath it (explicitly skipped by id). Canvas nodes
 * (`.react-flow__node[data-id]`) are checked before a still-open Cast dock's
 * mirror card (`[data-cast-card-node-id]`), so dropping onto an
 * already-eaten (hence hidden) identity card via the dock keeps working.
 */
function findCanvasDragHit(
  event: ReactMouseEvent,
  draggedNodeId: string,
): CanvasDragHit | null {
  const stackedElements = document.elementsFromPoint(
    event.clientX,
    event.clientY,
  )
  for (const candidate of stackedElements) {
    if (!(candidate instanceof Element)) continue
    const canvasNode = candidate.closest<HTMLElement>(
      '.react-flow__node[data-id]',
    )
    const canvasNodeId = canvasNode?.getAttribute('data-id')
    if (canvasNode && canvasNodeId && canvasNodeId !== draggedNodeId) {
      return { targetNodeId: canvasNodeId, cardElement: canvasNode }
    }
    const dockCard = candidate.closest<HTMLElement>('[data-cast-card-node-id]')
    const dockCardId = dockCard?.getAttribute('data-cast-card-node-id')
    if (dockCard && dockCardId && dockCardId !== draggedNodeId) {
      return { targetNodeId: dockCardId, cardElement: dockCard }
    }
  }
  return null
}

interface CanvasDragRectEntry {
  targetNodeId: string
  cardElement: HTMLElement
  rect: DOMRect
}

/**
 * A1 perf fix (canvas-relationship-v3-2026-07 §7b): snapshot every OTHER
 * card's screen rect ONCE, at drag start — target cards don't move while
 * something else is being dragged onto them, so this is a legitimate cache,
 * not a staleness risk. Consumed only by `handleNodeDrag`'s continuous 张口
 * bite-hover PREVIEW (visual-only feedback) — the actual BIND decision at
 * drop still calls the live `findCanvasDragHit` above, so a rect that's
 * briefly stale (e.g. a Cast dock card mid-open-transition) can only ever
 * cause a transient visual mismatch in the hover preview, never a wrong
 * bind. This is what replaces the old per-`pointermove` `elementsFromPoint`
 * call (S5d) that forced a synchronous layout on every single drag event —
 * the actual root cause of the "拖动手感钝" report (owner 2026-07-18
 * real-device test), since native pointermove can fire far faster than the
 * 60fps a drag visually needs.
 */
function buildCanvasDragRectCache(
  draggedNodeId: string,
): CanvasDragRectEntry[] {
  const entries: CanvasDragRectEntry[] = []
  document
    .querySelectorAll<HTMLElement>('.react-flow__node[data-id]')
    .forEach((el) => {
      const id = el.getAttribute('data-id')
      if (!id || id === draggedNodeId) return
      entries.push({
        targetNodeId: id,
        cardElement: el,
        rect: el.getBoundingClientRect(),
      })
    })
  document
    .querySelectorAll<HTMLElement>('[data-cast-card-node-id]')
    .forEach((el) => {
      const id = el.getAttribute('data-cast-card-node-id')
      if (!id || id === draggedNodeId) return
      entries.push({
        targetNodeId: id,
        cardElement: el,
        rect: el.getBoundingClientRect(),
      })
    })
  return entries
}

/** Cache-only counterpart to `findCanvasDragHit` — no DOM read, just a
 *  point-in-rect scan. Reverse iteration approximates "topmost first"
 *  (later-cached entries paint on top, mirroring the DOM/append order both
 *  `.react-flow__node` siblings and dock cards use) closely enough for a
 *  hover preview. */
function findCanvasDragHitFromCache(
  cache: readonly CanvasDragRectEntry[],
  clientX: number,
  clientY: number,
): CanvasDragHit | null {
  for (let i = cache.length - 1; i >= 0; i--) {
    const entry = cache[i]
    const { rect } = entry
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return {
        targetNodeId: entry.targetNodeId,
        cardElement: entry.cardElement,
      }
    }
  }
  return null
}

export function StudioNodeWorkbench() {
  return (
    <section
      // 2026-08-02（D7/D2 刀 1，owner 拍板）：画布自 2026-07-27 token 反转后
      // 已是浅色孤岛，根上原来的 `dark` class + colorScheme:'dark' 是暗色时代
      // 遗留——它让子树里共享组件的脊柱令牌解析成暗值（视频框模型丸白字落
      // 白底的病根），还在浅色面板边上画深色滚动条。令牌层的浅色化由
      // canvas.css `.domain-canvas` 的语义脊柱映射负责；这里只负责原生 UI
      // （滚动条/表单控件）的 color-scheme 跟浅色面走（<html> 仍是 dark，
      // 不显式声明会继承暗档）。
      style={{ colorScheme: 'light' }}
      className="relative h-[calc(100svh-3rem)] min-h-[36rem] overflow-hidden bg-node-canvas text-node-foreground lg:h-svh"
    >
      <ReactFlowProvider>
        {/* v0.2（2026-07-27，owner 拍板）：StudioNodeCanvas 用了
            useSearchParams()，硬刷新/直达链接会挂起这个边界——fallback 原来
            是 null，整个启动段（本机实测 ~5.1s）什么都不画。CanvasStartupSkeleton
            自带 .domain-canvas 读取 --canvas-*，见该文件顶部注释的作用域坑。 */}
        <Suspense fallback={<CanvasStartupSkeleton />}>
          <StudioNodeCanvas />
        </Suspense>
      </ReactFlowProvider>
    </section>
  )
}

function StudioNodeCanvas() {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const t = useTranslations('StudioNode')
  const tErrors = useTranslations('Errors')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const imageEditHandoff = useMemo(
    () => readCanvasImageEditHandoff(searchParams),
    [searchParams],
  )
  // Clerk userId scopes every localStorage slot and server call the hook
  // makes — passing null until Clerk loads parks the hook in an empty
  // state instead of leaking the previous account's snapshot.
  const { isLoaded, userId } = useAuth()
  const workflow = useNodeWorkflow({
    defaultProjectName: t('projectUntitled'),
    clerkId: isLoaded ? userId : null,
  })
  const seedancePromptPlan = useSeedancePromptPlan()
  const characterImageGeneration = useCharacterImageGeneration()
  const nodeMediaGeneration = useNodeMediaGeneration()
  const canvasImageDrop = useCanvasImageDrop()
  const modelOptionsByType = useWorkflowModelOptions()
  // Backfill in-flight generations whose foreground poll timed out (or whose
  // tab reloaded mid-run) by re-querying their persisted jobId on mount/focus.
  const reconcileFormatError = useCallback(
    (failure: { error?: string; errorCode?: string; i18nKey?: string }) =>
      getGenerationErrorMessage(
        tErrors,
        failure,
        t('mediaNodes.fallbackError'),
      ),
    [t, tErrors],
  )
  useNodeGenerationReconcile({
    nodes: workflow.nodes,
    updateNodeData: workflow.updateNodeData,
    formatError: reconcileFormatError,
  })
  const { fitView, screenToFlowPosition, flowToScreenPosition } = useReactFlow<
    NodeWorkflowNode,
    NodeWorkflowEdge
  >()
  // Bug fix 2026-07-27 (v4 — see hook doc for the full real-device history,
  // four root-causes deep): judges success by the actual target — expected
  // visible edge count vs. `g.react-flow__edge` elements actually in the
  // DOM — not `nodesInitialized`/`handleBounds` (deadlocked, see v1) and
  // not a DOM *node* count (looked caught up while edges were still 0, see
  // v3). Forces React Flow's store-level `updateNodeInternals(Map)` action
  // with real DOM elements + `force: true` on every miss (NOT the id-only
  // `useUpdateNodeInternals()` hook — that one's internal element lookup is
  // exactly what's deadlocked). One-shot by construction (see the hook) so
  // it never re-fires on ordinary re-renders, e.g. a node drag.
  const nodeInternalsStoreApi = useStoreApi()
  const getExpectedVisibleEdgeCount = useCallback(
    () =>
      nodeInternalsStoreApi.getState().edges.filter((edge) => !edge.hidden)
        .length,
    [nodeInternalsStoreApi],
  )
  const applyForcedNodeInternals = useCallback(
    (updates: Map<string, ForceNodeInternalsUpdate>) => {
      nodeInternalsStoreApi.getState().updateNodeInternals(updates)
    },
    [nodeInternalsStoreApi],
  )
  useUpdateNodeInternalsOnInit(
    workflow.nodes,
    getExpectedVisibleEdgeCount,
    applyForcedNodeInternals,
  )
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null)
  // canvas-generate-composer.md §0 快编互斥：哪个节点当前打开了
  // `CanvasQuickEditPrompt`（LooseImageCard 的 Position.Bottom 面板）——
  // `GenerateComposer` 读它给同一张卡的下方让位，避免两个浮层叠在同一块屏
  // 幕位置上。写入方只有 LooseImageCard，见该文件的同步 effect。
  const [quickEditNodeId, setQuickEditNodeId] = useState<string | null>(null)
  // S2a（2026-07-26）：助手默认**收起**。规格 §8 的宽度策略——左侧合体面板
  // 常驻 296px + 右助手约 420px = 716px 被 chrome 吃掉，1440 宽的屏只剩 724px
  // 画布。两侧不能同时满开，默认让位给画布。
  const [assistantDockOpen, setAssistantDockOpen] = useState(false)
  // E1b three states: collapsed (!open) / dock (open) / expanded (open+expanded).
  const [assistantExpanded, setAssistantExpanded] = useState(false)
  // The node whose ⤢ detail panel is open (B3 shared floating panel). One id
  // because a single shared panel renders the one expanded node.
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  // Left node locator panel. It is persistent workspace chrome, never an
  // overlay or a second editing surface.
  const [leftPanelExpanded, setLeftPanelExpanded] = useState(true)
  const [leftPanelView, setLeftPanelView] = useState<CanvasLeftPanelView>(
    CANVAS_LEFT_PANEL_VIEW_IDS.cast,
  )
  const [imageEditWorkspaceOpen, setImageEditWorkspaceOpen] = useState(false)
  const imageEditNodeByRequestRef = useRef(new Map<string, string>())
  const activeImageEditRequestKeyRef = useRef<string | null>(null)
  const pendingImageEditRequestKeyRef = useRef<string | null>(null)
  const [toolMode, setToolMode] = useState<NodeStudioToolMode>(
    NODE_STUDIO_TOOL_MODE_IDS.pointer,
  )
  const [projectDialogMode, setProjectDialogMode] = useState<
    'create' | 'rename' | null
  >(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Below the desktop rail breakpoint the assistant is an overlay. Start it
  // closed so tablet and phone users land on the canvas instead of a sheet.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setAssistantDockOpen(false)
      setAssistantExpanded(false)
    }
  }, [])

  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE

  const closeAddMenu = useCallback(() => {
    setAddMenu(null)
  }, [])

  /**
   * ⚠ 判据是「详情面板**是否真在渲染**」，不是「id 是否非空」（2026-08-04 修）。
   *
   * `NodeDetailPanel` 只在 `nodes.find(id)` 命中时才渲染。节点被删或切项目后
   * `expandedNodeId` 还留着，壳已被 AnimatePresence 静默卸载，而旧判据
   * `Boolean(expandedNodeId)` 恒为 true ⟹ 面板已经不在，系统却认为它还开着：
   * Esc 链永久早退、画布粘贴永久被挡（下方 keydown/paste 两处）、
   * 节点局部快编 chrome 永久被压（LooseImageCard 读同一个 context 值）。
   *
   * 下面那个 effect 会把悬空的 id 清掉，本行是同一件事的即时版 —— 两者都要：
   * effect 有一帧延迟，而这一帧里粘贴/Esc 就可能发生。
   */
  const detailPanelOpen =
    expandedNodeId !== null &&
    workflow.nodes.some((node) => node.id === expandedNodeId)

  const heavyOverlayOpen =
    detailPanelOpen ||
    imageEditWorkspaceOpen ||
    (assistantDockOpen && assistantExpanded)

  /**
   * 悬空 id 清理：删节点、切项目、以及任何让该节点从图里消失的路径。
   * ⚠ 此前全仓 `setExpandedNodeId(null)` 只有三处生产调用（面板 onClose 与两个
   * inspector 的「跳到下游节点」），**没有任何一处覆盖节点消失**。
   */
  useEffect(() => {
    if (expandedNodeId === null) return
    if (workflow.nodes.some((node) => node.id === expandedNodeId)) return
    setExpandedNodeId(null)
  }, [expandedNodeId, workflow.nodes])

  useEffect(() => {
    if (!heavyOverlayOpen) return
    setAddMenu(null)
  }, [heavyOverlayOpen])

  // The locator is persistent L4 chrome. The add menu is now the only L5
  // citizen mirrored into node-local quick-edit dismissal.
  const transientLayerOpen = Boolean(addMenu)

  useOverlayFocusReturn(Boolean(addMenu))
  useOverlayFocusReturn(Boolean(expandedNodeId))
  // R3-4 §4.2 rule 3 (焦点还原覆盖 L5/L6/L7): 档3-script（剧本笺展开）不是
  // Radix Dialog，没有 Radix 自带的关闭时焦点回归，需要这里手动补一份——
  // 档3-image（CanvasImageEditWorkspace）走 Radix ResponsiveDialog，那份由
  // Radix 自己处理，不重复注册。
  useOverlayFocusReturn(assistantDockOpen && assistantExpanded)

  /** 包 6 片 2：审阅模式的实时句柄，给下方 Esc 链与快捷键读（见那里的说明）。 */
  const reviewModeRef = useRef<NodeReviewMode | null>(null)
  /** 助手每铺完一批 +1；下面那个 effect 据此提示一次「去审吧」。 */
  const [assistantBatchMark, setAssistantBatchMark] = useState(0)
  const assistantBatchNoticeRef = useRef(0)

  // R3-4 §4.2 Esc 链（档3→档2→L5→**审阅模式**→取消选中，一次一层）。NodeDetailPanel(档2)
  // 和 CanvasImageEditWorkspace(档3-image，Radix Dialog) 已经各自听自己的
  // Escape——两者都用整屏 backdrop 挡住下层交互，永远不会跟这里的分支同时
  // 是"当前最高层"，所以 expandedNodeId / imageEditWorkspaceOpen 存在时这里
  // 完全不动，把这次按键让给各自的监听器（NodeDetailPanel 自己的 window
  // 监听 / Radix Dialog 内建的 onEscapeKeyDown）——否则同一次按键会被这里的
  // window 监听器"顺手"再吞一层（连带取消选中），一次按键退两层，破坏"一次
  // 一层"。这里接手没有 backdrop 的 档3-script（剧本笺展开）+ L5（添加菜单 /
  // 添加菜单）+ 取消选中。节点定位器是 L4 常驻 chrome，不进 Esc 链。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (expandedNodeId || imageEditWorkspaceOpen) return

      if (assistantDockOpen && assistantExpanded) {
        setAssistantExpanded(false)
        return
      }
      if (addMenu) {
        setAddMenu(null)
        return
      }
      // 包 6 片 2：审阅模式的三条出口之一。排在「取消选中」之前 —— 模式是更外
      // 的一层，用户按 Esc 想退的是模式，不是当前那张卡的选中态。
      // 走 ref 是因为 `reviewMode` 在本组件更下面才声明（它要等
      // `handleFocusNode`），而依赖数组是**渲染时**求值的，直接写进去会撞 TDZ。
      // 同 `quickThrowApiRef` 的手法：监听器按键时才读，那时早已赋值。
      const review = reviewModeRef.current
      if (review?.active) {
        review.exit()
        return
      }
      const hasSelection = workflow.nodes.some((node) => node.selected)
      if (hasSelection) {
        workflow.onNodesChange(
          workflow.nodes
            .filter((node) => node.selected)
            .map((node) => ({
              id: node.id,
              type: 'select' as const,
              selected: false,
            })),
        )
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    expandedNodeId,
    imageEditWorkspaceOpen,
    assistantDockOpen,
    assistantExpanded,
    addMenu,
    workflow,
  ])

  // S5f B2 快投模式: the provider publishes its live API here; canvas event
  // handlers below read it at click time (they live outside the provider).
  const quickThrowApiRef = useRef<QuickThrowApi | null>(null)

  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: NodeWorkflowNode) => {
      // In quick-throw mode a node click feeds the source into it (a no-op for
      // illegal/already-included targets, checked inside feedQuickThrow) —
      // NOT the normal select/expand. Out of mode: fall through to default.
      const api = quickThrowApiRef.current
      if (api?.quickThrowSource) {
        api.feedQuickThrow(node.id)
        // R3-3 (canvas-relationship-v3 §7 R3-1 遗留点名): React Flow's own
        // pointer-down handling selects the clicked node BEFORE this
        // onNodeClick callback ever runs, so a quick-throw feed click still
        // leaves the target "selected" as a side effect — which would also
        // reveal its 成分边 (R3-1 §2.2) layered under the quick-throw
        // highlight. §2.2 says quick-throw keeps its own highlight system
        // and does not stack with selection-reveal, so undo that incidental
        // selection right away.
        workflow.onNodesChange([
          { id: node.id, type: 'select', selected: false },
        ])
        return
      }
    },
    [workflow],
  )

  // Node double-click is deliberately unbound. Detail has one entry point:
  // the explicit expand button rendered by each node's toolbar.
  const handlePaneClick = useCallback(() => {
    // Clicking empty canvas exits quick-throw mode if active; otherwise it
    // keeps its existing job of closing the add-node menu.
    const api = quickThrowApiRef.current
    if (api?.quickThrowSource) {
      api.exitQuickThrow()
      return
    }
    closeAddMenu()
  }, [closeAddMenu])

  const getCanvasLocalPosition = useCallback(
    (position: XYPosition): XYPosition => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) {
        return position
      }

      return {
        x: position.x - rect.left,
        y: position.y - rect.top,
      }
    },
    [canvasRef],
  )

  const openAddMenu = useCallback(
    (menuPosition: XYPosition, flowPosition: XYPosition) => {
      setAddMenu({
        menuPosition,
        flowPosition,
      })
    },
    [],
  )

  const handleTidyLayout = useCallback(() => {
    if (workflow.nodes.length === 0) return
    workflow.tidyLayout()
    toast.success(t('toasts.layoutTidied'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [t, workflow])

  const [isSaving, setIsSaving] = useState(false)
  const handleSaveNow = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const ok = await workflow.saveNow()
      if (ok) {
        toast.success(t('toasts.workflowSaved'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
      } else {
        toast.error(t('toasts.workflowSaveFailed'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
      }
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, t, workflow])

  const handleTopbarAddClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const menuPosition = getCanvasLocalPosition({
        x: rect.left,
        y: rect.bottom,
      })

      openAddMenu(
        {
          x: menuPosition.x,
          y: menuPosition.y + NODE_STUDIO_NODE_PLACEMENT.menuOffset.y,
        },
        NODE_STUDIO_NODE_PLACEMENT.topbarAddPosition,
      )
    },
    [getCanvasLocalPosition, openAddMenu],
  )

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent<Element> | MouseEvent) => {
      event.preventDefault()
      const screenPosition = {
        x: event.clientX,
        y: event.clientY,
      }

      openAddMenu(
        getCanvasLocalPosition(screenPosition),
        screenToFlowPosition(screenPosition),
      )
    },
    [getCanvasLocalPosition, openAddMenu, screenToFlowPosition],
  )

  const createCanvasObject = useCallback(
    (intentId: CanvasAddIntentId, position: XYPosition): string => {
      const item = getCanvasAddCatalogItem(intentId)
      const newId = workflow.addNode(item.nodeType, position)

      if (item.role) {
        workflow.updateNodeData(newId, {
          ...createDefaultNodeData(NODE_IMAGE_ROLE_TO_LEGACY_TYPE[item.role]),
          role: item.role,
        })
      }

      return newId
    },
    [workflow],
  )

  const handleAddNode = useCallback(
    (intentId: CanvasAddIntentId) => {
      if (!addMenu) {
        return
      }

      createCanvasObject(intentId, addMenu.flowPosition)
      closeAddMenu()
    },
    [addMenu, closeAddMenu, createCanvasObject],
  )

  // 台账 #26（owner 2026-08-02 拍板「上传功能放入节点那边」）：添加菜单顶部
  // 主行改成真上传——点击弹系统文件选择器，选完在菜单打开处逐张建空图片
  // 节点，File 走 pendingPasteFilesRef 一次性交接给 ImageSourceStarter 自己
  // 的单文件上传链（真实进度/取消/失败重试，与画布级粘贴逐字节同一条路径，
  // 见下方 handlePaste 的注释）。取消选择 = 不建任何节点。
  const addUploadInputRef = useRef<HTMLInputElement | null>(null)
  const addUploadPositionRef = useRef<XYPosition | null>(null)
  const handleAddMenuUpload = useCallback(() => {
    if (!addMenu) {
      return
    }
    addUploadPositionRef.current = addMenu.flowPosition
    closeAddMenu()
    addUploadInputRef.current?.click()
  }, [addMenu, closeAddMenu])
  const handleAddUploadChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      const files = Array.from(input.files ?? []).filter((file) =>
        file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      // 清空 value：同一批文件可以再选一次（LooseImageCard 替换 input 同款）。
      input.value = ''
      const anchor = addUploadPositionRef.current
      addUploadPositionRef.current = null
      if (!anchor || files.length === 0) {
        return
      }
      files.forEach((file, index) => {
        const position = {
          x:
            anchor.x +
            index * NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.offsetX,
          y:
            anchor.y +
            index * NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.rowOffsetY,
        }
        const newNodeId = workflow.addNode(NODE_TYPE_IDS.image, position)
        pendingPasteFilesRef.current.set(newNodeId, file)
      })
    },
    [workflow],
  )

  const handleNodesDelete = useCallback(
    (nodes: NodeWorkflowNode[]) => {
      if (nodes.length === 0) {
        return
      }

      toast.info(t('toasts.nodesDeleted', { count: nodes.length }), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [t],
  )

  const handleCreateProject = useCallback(() => {
    setProjectDialogMode('create')
  }, [])

  const handleRenameProject = useCallback(() => {
    setProjectDialogMode('rename')
  }, [])

  const handleDeleteProject = useCallback(() => {
    setDeleteConfirmOpen(true)
  }, [])

  const handleProjectNameSubmit = useCallback(
    (name: string) => {
      if (projectDialogMode === 'create') {
        workflow.createProject(name)
        toast.success(t('toasts.projectCreated', { name }), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      if (name === workflow.currentProjectName) {
        return
      }

      workflow.renameCurrentProject(name)
      toast.success(t('toasts.projectRenamed', { name }), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [projectDialogMode, t, workflow],
  )

  const handleConfirmDeleteProject = useCallback(() => {
    const deletedProject = workflow.deleteProject(workflow.currentProjectId)
    if (!deletedProject) {
      return
    }

    toast.success(t('toasts.projectDeleted', { name: deletedProject.name }), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [t, workflow])

  const handleSwitchProject = useCallback(
    (projectId: string) => {
      workflow.switchProject(projectId)
    },
    [workflow],
  )

  // AI-enhance a Seedance node's prompt in place. This is the home of the
  // retired Agent `seedancePrompt` mode (canvas-baseline §13 B2): instead of a
  // separate planner node, the planner runs against the node's own prompt +
  // upstream references and writes the orchestrated plan back onto the node.
  // Uses the assistant's auto LLM route (no apiKeyId → server default planner +
  // platform credits), keeping a single text route on the canvas.
  const handleEnhanceSeedancePrompt = useCallback(
    async (seedanceNodeId: string) => {
      const seedanceNode = workflow.nodes.find(
        (node) => node.id === seedanceNodeId,
      )
      const idea = seedanceNode?.data.prompt?.trim() ?? ''

      if (!idea) {
        toast.info(t('videoComposer.enhanceEmptyTip'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const referenceSummary = summarizeUpstreamSeedanceReferences(
        seedanceNodeId,
        workflow.edges,
        workflow.nodes,
      )
      const references =
        referenceSummary.imageCount > 0 ||
        referenceSummary.videoCount > 0 ||
        referenceSummary.audio.length > 0
          ? referenceSummary
          : undefined

      workflow.updateNodeData(seedanceNodeId, {
        generationError: undefined,
        status: NODE_STATUS_IDS.running,
      })

      const result = await seedancePromptPlan.generate({
        idea,
        plannerProvider: DEFAULT_SCRIPT_PLANNER_PROVIDER,
        locale: appLocale,
        references,
      })

      if (result.success) {
        const plan = result.data.plan
        workflow.updateNodeData(seedanceNodeId, {
          motion: plan.motion,
          camera: plan.camera,
          duration: plan.duration,
          audioIntent: plan.audioIntent,
          prompt: plan.finalPrompt,
          timeline: plan.timeline,
          generationError: undefined,
          status: NODE_STATUS_IDS.ready,
        })
        toast.success(t('toasts.seedancePromptPlanned'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const failureMessage = getGenerationErrorMessage(
        tErrors,
        result,
        t('toasts.seedancePromptPlanFailed'),
      )
      workflow.updateNodeData(seedanceNodeId, {
        generationError: failureMessage,
        status: NODE_STATUS_IDS.failed,
      })
      toast.error(t('toasts.seedancePromptPlanFailed'), {
        description: failureMessage,
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [appLocale, seedancePromptPlan, t, tErrors, workflow],
  )

  const handleGenerateCharacterImage = useCallback(
    async (nodeId: string) => {
      const node = workflow.nodes.find((item) => item.id === nodeId)
      const prompt = node?.data.prompt.trim() ?? ''
      const model = node?.data.model

      if (!node || node.type !== NODE_TYPE_IDS.characterImage) {
        return
      }

      if (!model) {
        toast.info(t('characterImage.noModel'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      if (!prompt) {
        toast.info(t('characterImage.noPrompt'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      workflow.updateNodeData(nodeId, {
        generationError: undefined,
        generationStatus: NODE_GENERATION_STATUS_IDS.pending,
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
        // 用户路径必须**主动清**上一次的来源：这个节点可能刚被助手生成过，留着
        // `assistant` 的话，本次生成一旦转 pending，reconcile 会照旧值把用户自
        // 己点的结果标进待审队列（包 6 ①-bis 的反向误判）。
        mediaJobSource: undefined,
        status: NODE_STATUS_IDS.running,
      })

      const maxReferenceImages = getMaxReferenceImages(
        model.adapterType,
        model.modelId,
      )
      const existingImageReference =
        node.data.imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
          ? node.data.imageUrl
          : undefined
      // R3-6a §1 共享装配: same dedup + cap `assembleReferenceImagePayload` used
      // by handleGenerateMediaNode below — see node-reference-payload.ts.
      // R3-6b §1: the function now also reports `overflow`, unused on this
      // (character card) path — the capacity-transparency UI lives only on
      // the video composer, which has its own call into the same function.
      const referenceImages = assembleReferenceImagePayload(
        [
          existingImageReference,
          ...(node.data.referenceAssets ?? []).map(
            (reference) => reference.url,
          ),
        ],
        maxReferenceImages,
      ).imageUrls
      // 画布不再往角色图挂 LoRA（owner 2026-08-07「不要」）：唯一的编辑入口
      // `CharacterImageLoraControls` 早在 04f8f6be（2026-08-05，详情面板七槽改造）
      // 就被摘出面板，之后两天里 `node.data.loras` 只有读没有写，恒为空数组。
      // 这里连同 sibling generate 路径一起退役——留着等于让一条永远取不到值的
      // 分支伪装成能力。要恢复能力得先把编辑入口接回七槽，那时再一起加。
      const result = await characterImageGeneration.generate(
        {
          modelId: model.modelId,
          apiKeyId: model.apiKeyId,
          freePrompt: prompt,
          aspectRatio: DEFAULT_ASPECT_RATIO,
          referenceImages:
            referenceImages.length > 0 ? referenceImages : undefined,
        },
        {
          // Persist the jobId the moment it exists so a reload or poll-window
          // timeout mid-flight stays reconcilable (see reconcile hook).
          onJobCreated: (jobId) =>
            workflow.updateNodeData(nodeId, { mediaJobId: jobId }),
        },
      )

      if (result.success) {
        workflow.updateNodeData(nodeId, {
          generationError: undefined,
          generationId: result.generation.id,
          generationStatus: NODE_GENERATION_STATUS_IDS.success,
          imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
          imageUrl: result.imageUrl,
          mediaJobId: undefined,
          sourceGenerationId: undefined,
          sourceLabel: undefined,
          status: NODE_STATUS_IDS.done,
          // 包 6 ①-bis：**故意不标待审**。这条路只有用户能走（角色卡上的生成
          // 按钮）——助手的 generate op 走 `handleGenerateMediaNode`，characterImage
          // 在 NODE_MEDIA_KIND_BY_NODE_TYPE 里也是 image kind。你亲手点的生成
          // 你已经在场，再拦一道是仪式。别按「AI 出的图都该待审」加回来。
        })
        toast.success(t('toasts.characterGenerated'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      if (result.pending) {
        // The poll window closed but the job is still running server-side.
        // Hold the node in `pending` (not idle) with its jobId persisted so the
        // reconcile pass backfills the result instead of dropping it.
        workflow.updateNodeData(nodeId, {
          generationError: undefined,
          generationStatus: NODE_GENERATION_STATUS_IDS.pending,
          mediaJobId: result.jobId,
          status: NODE_STATUS_IDS.running,
        })
        toast.info(t('toasts.stillProcessing'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const failureMessage = getGenerationErrorMessage(
        tErrors,
        result,
        t('characterImage.fallbackError'),
      )

      workflow.updateNodeData(nodeId, {
        generationError: failureMessage,
        generationStatus: NODE_GENERATION_STATUS_IDS.error,
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
        mediaJobId: undefined,
        status: NODE_STATUS_IDS.failed,
      })
      toast.error(t('characterImage.failedTitle'), {
        description: failureMessage,
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [characterImageGeneration, t, tErrors, workflow],
  )

  /**
   * 生成一个媒体节点。**用户和助手共用这一个入口** —— `node-assistant-op-plan`
   * 文件头写明助手的 generate op 与这里是同一组前提，所以两边不能各走一份。
   *
   * 正因为共用，「谁发起的」没有天然接缝，只能**显式传**（包 6 ①-bis）：
   * `source` 决定结果进不进待审队列。⛔ 禁止改成从「助手 dock 开着吗」「有没有
   * pending op」反推 —— 助手关掉后重跑同一个节点，那种推断当场判错。
   *
   * 默认 `user`：漏传时的后果是「少拦一道」，比错拦用户自己的生成轻。
   *
   * `promptOverride` 是「本次用这个 free prompt，别读节点上的那个」。审阅里的
   * 「改词再来」需要它：调用方刚把新词写进节点，但 `updateNodeData` 是 setState，
   * 本函数闭包里的 `workflow.nodes` 还是写之前的快照（`use-generate-composer`
   * 文件头记的同一条 same-tick stale-closure）。把值直接递进来是唯一不靠时序的
   * 写法。只替 `data.prompt` 一项 —— 镜头/构图/动作那些结构字段照旧参与拼装。
   */
  const handleGenerateMediaNode = useCallback(
    async (
      nodeId: string,
      source: NodeGenerationSource = NODE_GENERATION_SOURCE_IDS.user,
      promptOverride?: string,
    ) => {
      const node = workflow.nodes.find((item) => item.id === nodeId)
      const kind = node ? NODE_MEDIA_KIND_BY_NODE_TYPE[node.type] : undefined
      const ownPrompt = node
        ? buildNodeWorkflowPrompt(
            node.type,
            promptOverride === undefined
              ? node.data
              : { ...node.data, prompt: promptOverride },
          )
        : ''
      const model = node?.data.model

      if (!node || !kind || kind === NODE_MEDIA_KIND_IDS.text) {
        return
      }

      if (!model) {
        toast.info(t('mediaNodes.noModel'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const isImageMediaNode = kind === NODE_MEDIA_KIND_IDS.image
      const isVideoMediaNode = kind === NODE_MEDIA_KIND_IDS.video
      const isAudioMediaNode = kind === NODE_MEDIA_KIND_IDS.audio
      // Shot image nodes are the one image-gen type that reads the graph: they
      // harvest upstream character/background images as named references.
      const isShotImageNode = isImageMediaNode && isShotNode(node)

      // Graph-aware harvests: video nodes read upstream shotText prompts,
      // visual + keyframe reference images, and voice audio; shot image nodes
      // read upstream character/background images. Other image / audio nodes
      // use only their own Inspector inputs.
      const upstreamNodes =
        isVideoMediaNode || isShotImageNode
          ? getUpstreamNodes(nodeId, workflow.edges, workflow.nodes)
          : []
      const upstreamTextPrompt = isVideoMediaNode
        ? harvestUpstreamShotTextPrompt(upstreamNodes)
        : ''
      // image_urls = direct visual refs (keyframes → character/background/shot)
      // then 1-hop closeups (§9 B): a character's face-detail images ride behind
      // it. Same order the composer's payloadImageUrls computes, so the 图N /
      // 特写N slot badges match what's actually sent.
      // 包 4：收割函数内置审核门，`.urls` 已经只含过审的图；`.blocked` 是被挡下
      // 的那些，下面必须**显式告诉用户**——静默少发一张比不挡更糟。
      const harvestedImages = isVideoMediaNode
        ? // R3-6b §3 每镜覆写: pass edges + nodeId so a collector's
          // contribution honors this specific collector→video edge's
          // stageOverrideUrls instead of always falling back to the card's
          // own onStage curation.
          harvestUpstreamImageUrls(upstreamNodes, workflow.edges, nodeId)
        : { urls: [], blocked: [] }
      const harvestedCloseups = isVideoMediaNode
        ? harvestUpstreamCloseupUrls(nodeId, workflow.edges, workflow.nodes)
        : { urls: [], blocked: [] }
      const upstreamImageUrls = [
        ...harvestedImages.urls,
        ...harvestedCloseups.urls,
      ]
      // harvestUpstreamAudioBindings walks one hop further than the plain
      // voice harvest: voices wired through a character node carry that
      // character's name forward, so multi-character scenes can label
      // `@AudioN` tokens with the right speaker in the fal prompt.
      const upstreamAudioBindings = isVideoMediaNode
        ? harvestUpstreamAudioBindings(
            nodeId,
            workflow.edges,
            workflow.nodes,
          ).slice(0, 3)
        : []
      const upstreamAudioUrls = upstreamAudioBindings.map((b) => b.url)
      // Reference-video clips for Seedance reference-to-video. Each clip
      // contributes towards the cross-modality cap (≤12 files total) which
      // the builder enforces against image_urls.
      const upstreamVideoUrls = isVideoMediaNode
        ? harvestUpstreamVideoUrls(upstreamNodes).slice(0, 3)
        : []
      // Named character/background references for a shot node — URL + subject
      // name, so each can be passed as a reference image AND labeled in the
      // prompt legend below.
      const harvestedReferences = isShotImageNode
        ? harvestUpstreamImageReferences(upstreamNodes)
        : { references: [], blocked: [] }
      const upstreamImageReferences = harvestedReferences.references

      // 两条收割链的排除清单合起来报一次。⚠ 这是 §5-W3「排除时要提示」的落点：
      // 门禁生效但用户不知道，等价于产品在骗他。
      const blockedByReview = [
        ...harvestedImages.blocked,
        ...harvestedCloseups.blocked,
        ...harvestedReferences.blocked,
      ]
      if (blockedByReview.length > 0) {
        const pending = blockedByReview.filter(
          (item) => item.state === NODE_REVIEW_STATE_IDS.awaitingReview,
        ).length
        const rejected = blockedByReview.length - pending
        toast.info(
          t('mediaNodes.reviewBlocked', {
            total: blockedByReview.length,
            pending,
            rejected,
          }),
          {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          },
        )
      }

      const mergedPrompt = mergePromptWithUpstreamText(
        ownPrompt,
        upstreamTextPrompt,
      )

      if (!mergedPrompt) {
        toast.info(t('mediaNodes.noPrompt'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      workflow.updateNodeData(nodeId, {
        generationError: undefined,
        generationStatus: NODE_GENERATION_STATUS_IDS.pending,
        ...(isImageMediaNode
          ? {
              imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
              imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
            }
          : {}),
        mediaKind: kind,
        // 派发时就落盘来源：这一次生成若超出轮询窗口（甚至跨刷新），回填由
        // `use-node-generation-reconcile` 做，那时内存里的 `source` 早没了。
        mediaJobSource: source,
        status: NODE_STATUS_IDS.running,
      })

      const maxReferenceImages = getMaxReferenceImages(
        model.adapterType,
        model.modelId,
      )
      const existingImageReference =
        isImageMediaNode &&
        node.data.imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
          ? node.data.mediaUrl
          : undefined
      // R3-6a §1 共享装配: dedup + cap now lives in assembleReferenceImagePayload
      // (node-reference-payload.ts) — same function handleGenerateCharacterImage
      // uses above, single source of truth for the "collect → dedupe → cap"
      // step v4 §14.3 flagged as a drift risk while inline in two places.
      // Priority order preserved byte-for-byte: existing image ref → own
      // referenceAssets → upstream harvested URLs (R3-6 出场组-expanded, see
      // harvestUpstreamImageUrls) → upstream named references.
      // R3-6b §1: `.imageUrls` is what actually ships; the sibling `.overflow`
      // (truncated candidates) is what `ReferenceManagerPanel`'s capacity UI
      // shows — computed independently there via the SAME function against
      // the SAME live graph state (`useVideoComposer`'s `sendPreview`), not
      // threaded through this async handler.
      const referenceCandidateSources = [
        existingImageReference,
        ...(node.data.referenceAssets ?? []).map((asset) => asset.url),
        ...upstreamImageUrls,
        ...upstreamImageReferences.map((reference) => reference.url),
      ]
      const referenceImages = assembleReferenceImagePayload(
        referenceCandidateSources,
        maxReferenceImages,
      ).imageUrls
      // Bug fix 2026-07-27（@ 过滤顺序）: the V-3b filter below has to see every
      // DEDUPED candidate, not just the ones that survived the cap — otherwise
      // an @-mentioned image ranked past `maxReferenceImages` in raw priority
      // order gets cut here before the filter ever gets a chance to keep it
      // for being referenced. Same dedup (first-seen-wins, same priority
      // order) as `referenceImages` above, just uncapped; the real cap is
      // re-applied AFTER filtering — see `effectiveReferenceImages` below —
      // so the model's actual reference-image limit still holds either way.
      const dedupedReferenceCandidates = assembleReferenceImagePayload(
        referenceCandidateSources,
        Number.POSITIVE_INFINITY,
      ).imageUrls
      // Map harvested references by URL so the legend labels each by its FINAL
      // position in referenceImages (after dedup + cap). S5d ③ 分类进图例:
      // seed from the node's OWN category-labeled referenceAssets first (a
      // shot's manually-added 风格/道具/关键帧 refs), then let the upstream
      // character/background harvest OVERWRITE on a URL collision — a named
      // upstream subject is the more specific label when both exist for the
      // same url.
      const referenceByUrl = new Map<string, UpstreamImageReference>(
        buildReferenceAssetLegendEntries(node.data.referenceAssets),
      )
      for (const reference of upstreamImageReferences) {
        referenceByUrl.set(reference.url, reference)
      }
      // Video legend (§7.2⑦ / §9 D): bind every sent 图N/视N/音N slot to its
      // subject so the composer's @name / @特写N / @视频N tokens resolve. Auto-name
      // prefixes come from the SAME i18n key the composer's autoName uses, so the
      // fallback names are byte-identical to the tokens in the prompt.
      const videoImageRefByUrl = isVideoMediaNode
        ? harvestUpstreamVideoImageReferences(
            nodeId,
            workflow.edges,
            workflow.nodes,
          )
        : new Map<string, VideoLegendImageReference>()
      // SAME i18n key the composer's autoName uses (§7.2⑦) — reused below both
      // for the legend AND the name→@ImageN translation map, so an unnamed
      // card's auto token ("@角色1") resolves identically in both places.
      const videoImageAutoNamePrefix = {
        character: t('videoComposer.autoName.character'),
        background: t('videoComposer.autoName.background'),
        shot: t('videoComposer.autoName.shot'),
        closeup: t('videoComposer.autoName.closeup'),
        video: t('videoComposer.autoName.video'),
      }
      // V-3b 只送已引用（docs/references/pages/canvas-video-card.md
      // 决策1）: narrow the sent image_urls down to only what `mergedPrompt`
      // actually `@`-mentions. 迁移红线 lives inside `filterReferencedImages`
      // itself — a project with connections but no matching @-mention keeps
      // sending everything (pre-V-3 behaviour), so upgrading never silently
      // drops a reference. Filters against `dedupedReferenceCandidates` (see
      // above), NOT the capped `referenceImages` — an @-mentioned image
      // ranked past the cap must still survive; `effectiveReferenceImages`
      // below re-applies the real cap AFTER filtering (Bug fix 2026-07-27).
      // `referenceImages` above stays the raw capped set (still used as-is
      // by the shot-image branch, which V-3b does not touch — §3 决策8 维持现状).
      const referencedFilter = isVideoMediaNode
        ? filterReferencedImages(
            mergedPrompt,
            dedupedReferenceCandidates,
            videoImageRefByUrl,
            videoImageAutoNamePrefix,
          )
        : null
      // `.slice(0, maxReferenceImages)` on the non-video fallback branch
      // (`referenceImages`, already capped) is a harmless no-op — it only
      // does real work on the video branch, where `referencedFilter` may
      // still exceed the cap (the migration pass-through can return the full
      // uncapped set, or the user may @-mention more distinct images than
      // the model allows).
      const effectiveReferenceImages = (
        referencedFilter ? referencedFilter.referenceImages : referenceImages
      ).slice(0, maxReferenceImages)
      const referenceLegend = isShotImageNode
        ? buildShotReferenceLegend(referenceImages, referenceByUrl)
        : isVideoMediaNode
          ? buildVideoReferenceLegend({
              referenceImages: effectiveReferenceImages,
              imageRefByUrl: videoImageRefByUrl,
              videoUrls: upstreamVideoUrls,
              audioBindings: upstreamAudioBindings,
              labels: {
                title: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.title,
                imagePrefix: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.imagePrefix,
                videoPrefix: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.videoPrefix,
                audioPrefix: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.audioPrefix,
                kindLabel: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.kindLabel,
                autoNamePrefix: videoImageAutoNamePrefix,
                characterVoiceSuffix:
                  NODE_STUDIO_VIDEO_REFERENCE_LEGEND.characterVoiceSuffix,
                narration: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.narration,
              },
            })
          : ''
      // V-1 发送翻译层（docs/references/pages/canvas-video-card.md）: Seedance
      // only resolves the POSITIONAL @Image1/@Image2… token (verified against
      // fal's reference-to-video contract), never a custom name — so the
      // @弗洛洛 mention MentionInput serialized into `mergedPrompt` has to be
      // rewritten to @ImageN right before it leaves the client. The node's
      // stored prompt / what the composer renders is untouched; only this
      // outbound copy (`seedanceReadyPrompt`) changes. No-op for non-video
      // media kinds (empty map → returned verbatim). `imageIndexByName` comes
      // from the V-3b filter above, re-filtered here to positions that
      // survive the post-filter cap (`effectiveReferenceImages.length`): the
      // filter above now runs against the UNCAPPED candidate set, so a name
      // whose position lands past the real cap must be dropped here too, or
      // it would translate into an @ImageN token nothing was actually sent
      // for (Bug fix 2026-07-27).
      const imageIndexByName = referencedFilter
        ? new Map(
            Array.from(referencedFilter.imageIndexByName).filter(
              ([, position]) => position <= effectiveReferenceImages.length,
            ),
          )
        : new Map<string, number>()
      const seedanceReadyPrompt = translatePromptTokensToPositional(
        mergedPrompt,
        imageIndexByName,
      )
      const finalPrompt = referenceLegend
        ? `${referenceLegend}\n\n${seedanceReadyPrompt}`
        : seedanceReadyPrompt
      // Negative prompt is video-only (Studio's VideoParams panel mirrors
      // this restriction). Image kinds don't surface a control today, so we
      // only forward it when generating video.
      const negativePrompt =
        isVideoMediaNode && typeof node.data.negativePrompt === 'string'
          ? node.data.negativePrompt.trim() || undefined
          : undefined
      const videoGenerateAudio =
        isVideoMediaNode && typeof node.data.generateAudio === 'boolean'
          ? node.data.generateAudio
          : undefined
      const videoSeed =
        isVideoMediaNode && typeof node.data.seed === 'number'
          ? node.data.seed
          : undefined
      // 这条路径不再有 advancedParams 可送：它唯一的来源是角色图 LoRA，而那个
      // 编辑入口 04f8f6be 起就不在面板里了（详见上方角色图 generate 路径注释）。

      // Bridge: duration is stored as a string in node.data (text-input
      // legacy). The wire format accepts either a 4-15 integer or the
      // literal 'auto' (Seedance-only). 'auto' passes through verbatim;
      // numeric strings get parsed + clamped; anything else falls back to
      // undefined so the service-side default kicks in.
      const rawDuration =
        isVideoMediaNode && typeof node.data.duration === 'string'
          ? node.data.duration.trim()
          : ''
      const videoDuration: number | 'auto' | undefined = (() => {
        if (rawDuration === 'auto') return 'auto'
        const parsed = Number(rawDuration)
        if (!Number.isFinite(parsed)) return undefined
        if (parsed < 4 || parsed > 15) return undefined
        return parsed
      })()
      const videoResolution =
        isVideoMediaNode && typeof node.data.resolution === 'string'
          ? (node.data.resolution as
              | '480p'
              | '540p'
              | '720p'
              | '1080p'
              | undefined)
          : undefined
      const videoAspectRatio =
        isVideoMediaNode && typeof node.data.aspectRatio === 'string'
          ? (node.data.aspectRatio as
              | '1:1'
              | '16:9'
              | '9:16'
              | '4:3'
              | '3:4'
              | undefined)
          : undefined
      const audioVoiceId =
        isAudioMediaNode && typeof node.data.voiceId === 'string'
          ? node.data.voiceId.trim() || undefined
          : undefined
      const audioSpeed =
        isAudioMediaNode && typeof node.data.voiceSpeed === 'number'
          ? node.data.voiceSpeed
          : undefined
      const audioVolume =
        isAudioMediaNode && typeof node.data.voiceVolume === 'number'
          ? node.data.voiceVolume
          : undefined
      const audioEmotion: AudioEmotion | undefined =
        isAudioMediaNode &&
        typeof node.data.voiceEmotion === 'string' &&
        (AUDIO_EMOTIONS as readonly string[]).includes(node.data.voiceEmotion)
          ? (node.data.voiceEmotion as AudioEmotion)
          : undefined

      // 端点由**节点上的模式**挑，不再按「这次接了什么」自动判。
      //
      // 旧做法（reference-by-input）在有了显式模式之后是错的：用户选了「关键帧」，
      // 往节点上接一段视频，不该把他偷偷换到全能参考的端点上；反过来选了「全能参考」
      // 却还没接东西，也不该掉回首帧端点。模式是用户说了算的那个事实，输入不是。
      //
      // 它当初要解决的问题仍然被解决着：持久化的 data.model 只记「型号 + 渠道」，
      // 具体端点每次提交按模式重算，所以节点后来加了参考边也不会卡在旧 id 上。
      //
      // ⚠ 解析不到时保留原选择（`?? model.modelId`），绝不回退到别的端点。
      const effectiveVideoModel = isVideoMediaNode
        ? resolveVideoModelForMode(
            model,
            node.data.videoMode ??
              getNodeModeForModel(model.modelId, model.adapterType),
            modelOptionsByType[NODE_TYPE_IDS.seedance] ?? [],
          )
        : null
      const submitModelId = effectiveVideoModel?.modelId ?? model.modelId
      const submitApiKeyId = effectiveVideoModel?.apiKeyId ?? model.apiKeyId
      // One canonical model-specific plan feeds both the sidecar preview and
      // the real request. The legacy generic assembly above remains for image
      // and shot branches; video payload values come exclusively from this
      // graph + selected-model projection.
      const videoSendPlan = isVideoMediaNode
        ? buildVideoSendPreview({
            nodeId,
            data: node.data,
            edges: workflow.edges,
            nodes: workflow.nodes,
            modelId: submitModelId,
            adapterType: effectiveVideoModel?.adapterType ?? model.adapterType,
            maxReferenceImages: undefined,
            autoNamePrefix: videoImageAutoNamePrefix,
          })
        : null

      if (videoSendPlan && !videoSendPlan.canSubmit) {
        const failureMessage = videoSendPlan.blockers.includes(
          'audio-requires-visual',
        )
          ? t('videoGeneration.audioRequiresVisual')
          : t('videoGeneration.executionNotMigrated')
        workflow.updateNodeData(nodeId, {
          generationError: failureMessage,
          generationStatus: NODE_GENERATION_STATUS_IDS.error,
          mediaJobId: undefined,
          mediaKind: kind,
          status: NODE_STATUS_IDS.failed,
        })
        toast.error(t('toasts.mediaGenerationFailed'), {
          description: failureMessage,
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const result = await nodeMediaGeneration.generate(
        {
          kind,
          modelId: submitModelId,
          apiKeyId: submitApiKeyId,
          prompt: videoSendPlan?.request.prompt ?? finalPrompt,
          duration: videoDuration,
          resolution: videoResolution,
          aspectRatio: videoAspectRatio,
          referenceImages: videoSendPlan
            ? videoSendPlan.request.referenceImages
            : effectiveReferenceImages.length > 0
              ? effectiveReferenceImages
              : undefined,
          audioUrls: videoSendPlan
            ? videoSendPlan.request.audioUrls
            : upstreamAudioUrls.length > 0
              ? upstreamAudioUrls
              : undefined,
          audioBindings: videoSendPlan
            ? videoSendPlan.request.audioBindings
            : upstreamAudioBindings.length > 0
              ? upstreamAudioBindings
              : undefined,
          videoUrls: videoSendPlan
            ? videoSendPlan.request.videoUrls
            : upstreamVideoUrls.length > 0
              ? upstreamVideoUrls
              : undefined,
          voiceId: audioVoiceId,
          speed: audioSpeed,
          volume: audioVolume,
          emotion: audioEmotion,
          negativePrompt,
          generateAudio: videoGenerateAudio,
          seed: videoSeed,
        },
        {
          // Persist the jobId the moment it exists so a reload or poll-window
          // timeout mid-flight stays reconcilable (see reconcile hook).
          onJobCreated: (jobId) =>
            workflow.updateNodeData(nodeId, { mediaJobId: jobId }),
        },
      )

      if (result.success) {
        workflow.updateNodeData(nodeId, {
          generationError: undefined,
          generationId: result.generation.id,
          generationStatus: NODE_GENERATION_STATUS_IDS.success,
          ...(isImageMediaNode
            ? {
                imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
                imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
                sourceGenerationId: undefined,
                sourceLabel: undefined,
              }
            : {}),
          mediaJobId: undefined,
          mediaJobSource: undefined,
          mediaKind: kind,
          mediaUrl: result.mediaUrl,
          // 包 4：助手出的媒体默认「已出未审」（图/视频/音频同理，门禁这一期
          // 只挡 image_urls，但状态一视同仁地记，免得以后补别的门要回填历史）。
          // 包 6 ①-bis：用户自己点的生成不进队列 —— 判据是显式来源，不是「有没
          // 有生成成功」。
          ...(source === NODE_GENERATION_SOURCE_IDS.assistant
            ? markMediaAwaitingReview(node.data, result.mediaUrl, {
                markedAt: new Date().toISOString(),
              })
            : {}),
          ...(isVideoMediaNode
            ? {
                videoThumbnailUrl: result.thumbnailUrl,
                lineage: {
                  operation: 'generate' as const,
                  sourceUrls: [
                    ...(videoSendPlan
                      ? (videoSendPlan.request.referenceImages ?? [])
                      : effectiveReferenceImages),
                    ...(videoSendPlan
                      ? (videoSendPlan.request.videoUrls ?? [])
                      : upstreamVideoUrls),
                    ...(videoSendPlan
                      ? (videoSendPlan.request.audioUrls ?? [])
                      : upstreamAudioUrls),
                  ].slice(0, 9),
                },
              }
            : {}),
          ...(isAudioMediaNode
            ? {
                audioClip: {
                  url: result.mediaUrl,
                  generationId: result.generation.id,
                  role: 'speech' as const,
                  ...(typeof result.generation.duration === 'number'
                    ? { durationSeconds: result.generation.duration }
                    : {}),
                },
              }
            : {}),
          // ⚠ 包 4.5：**不再**把 `generation.model` 写进 `mediaLabel`。
          // `mediaLabel` 是显示名字段（卡面标签 / 卡匣 / 助手 payload 全读它），
          // 把模型 id 写进去等于替用户起了个名 —— 一张从没被命名过的生成图，
          // 在助手眼里就叫 `gemini-3.1-flash-image-preview`。模型信息本来就还在
          // `data.model` 与 `generationId` 指向的 Generation 记录上，这里是冗余。
          // seed 复现闭环：回写 provider 实际用的 seed 供前端展示 +「锁定」。
          lastSeed:
            typeof result.generation.seed === 'number'
              ? result.generation.seed
              : undefined,
          status: NODE_STATUS_IDS.done,
        })
        toast.success(t('toasts.mediaGenerated'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      if (result.pending) {
        // The poll window closed but the job is still running server-side.
        // Hold the node in `pending` (not idle) with its jobId persisted so the
        // reconcile pass backfills the result instead of dropping it.
        // ⚠ `mediaJobSource` **有意不清** —— 派发时写下的那个值正是给 reconcile
        // 用的，这一条分支恰恰是它存在的理由。
        workflow.updateNodeData(nodeId, {
          generationError: undefined,
          generationStatus: NODE_GENERATION_STATUS_IDS.pending,
          mediaJobId: result.jobId,
          mediaKind: kind,
          status: NODE_STATUS_IDS.running,
        })
        toast.info(t('toasts.stillProcessing'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const failureMessage = getGenerationErrorMessage(
        tErrors,
        result,
        t('mediaNodes.fallbackError'),
      )

      workflow.updateNodeData(nodeId, {
        generationError: failureMessage,
        generationStatus: NODE_GENERATION_STATUS_IDS.error,
        ...(isImageMediaNode
          ? {
              imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
              imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
            }
          : {}),
        mediaJobId: undefined,
        mediaJobSource: undefined,
        mediaKind: kind,
        status: NODE_STATUS_IDS.failed,
      })
      toast.error(t('toasts.mediaGenerationFailed'), {
        description: failureMessage,
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [modelOptionsByType, nodeMediaGeneration, t, tErrors, workflow],
  )

  /**
   * canvas-generate-composer.md §7「结果落点」: the generate composer's send
   * action. Mirrors `handleGenerateMediaNode`'s image-kind result handling
   * (success/pending/failure branches are intentionally near-duplicates of
   * that function's tail — extracting a shared helper would mean threading
   * a bigger shared signature through a function that also serves video/
   * audio/shot-harvest concerns this composer doesn't have; a small bounded
   * duplication reads clearer than that indirection) but does NOT reuse it
   * directly: `handleGenerateMediaNode` re-reads `workflow.nodes.find(id)`
   * for its OWN inputs, which would race the `updateNodeData` seed this
   * function just wrote in the same tick (React state updates aren't
   * applied synchronously — see `GenerateComposerSendInput`'s doc comment).
   * This function takes every input as a plain argument instead, so there's
   * nothing to race.
   */
  const handleRunGenerateComposer = useCallback(
    async (input: GenerateComposerSendInput): Promise<string[]> => {
      // Captured BEFORE any `addNode` call below — `workflow.nodes` is a
      // snapshot closed over at render time, so a node created via
      // `workflow.addNode` inside this same call never appears in it (the
      // state update that would add it hasn't been applied/re-rendered
      // yet). Reading "who's currently selected" now, once, up front, and
      // combining it with `targetIds` (already in hand from `addNode`'s
      // own return values) below avoids ever needing to re-read
      // `workflow.nodes` for an id this function just minted.
      const previouslySelectedIds = workflow.nodes
        .filter((node) => node.selected)
        .map((node) => node.id)

      const maxReferenceImages = getMaxReferenceImages(
        input.model.adapterType,
        input.model.modelId,
      )
      // R3-6a §1 共享装配: same dedup + cap function every other reference-
      // collecting path in this file uses — single source of truth, not a
      // second independent tally.
      const referenceImages = assembleReferenceImagePayload(
        input.referenceUrls,
        maxReferenceImages,
      ).imageUrls
      // `referenceUrls[0]` is the pinned host slot whenever the host has
      // media (canvas-generate-composer.md §4 — the composer always puts it
      // first), everything after is a library pick.
      const referenceAssets = referenceImages.map((url, index) => ({
        id:
          globalThis.crypto?.randomUUID?.() ??
          `ref-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        url,
        role: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
        weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
        source:
          index === 0 && input.hostHasMedia
            ? NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas
            : NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
      }))

      const runs = Math.max(1, Math.min(input.batchCount, 4))
      // §7 一条对称的例外：空卡宿主（或刚从空白处新建、同样是空的节点）吸收
      // 第一个结果；张数 > 1 时后续结果、以及有图宿主的每一个结果，都新建
      // 兄弟节点——"改前 vs 改后" 永远不覆盖。
      const fillsInPlace = Boolean(input.hostNodeId) && !input.hostHasMedia
      const targetIds: string[] = []
      let newNodeIndex = 0

      for (let i = 0; i < runs; i += 1) {
        let targetId: string
        if (i === 0 && fillsInPlace && input.hostNodeId) {
          targetId = input.hostNodeId
        } else {
          const position = computeSpawnPosition(
            input.sourcePosition,
            newNodeIndex,
          )
          newNodeIndex += 1
          targetId = workflow.addNode(NODE_TYPE_IDS.image, position)
          if (input.hostNodeId) {
            workflow.onConnect({
              source: input.hostNodeId,
              sourceHandle: null,
              target: targetId,
              targetHandle: null,
            })
          }
        }
        workflow.updateNodeData(targetId, {
          prompt: input.prompt,
          model: input.model,
          aspectRatio: input.aspectRatio,
          imageResolution: input.imageResolution,
          referenceAssets,
          mediaKind: NODE_MEDIA_KIND_IDS.image,
          generationStatus: NODE_GENERATION_STATUS_IDS.pending,
          // 同上：清掉上一次可能是助手写的来源，免得这次用户生成转 pending 后被
          // reconcile 按旧值标进待审队列。
          mediaJobSource: undefined,
          status: NODE_STATUS_IDS.running,
        })
        targetIds.push(targetId)
      }

      // §7 生成完成后：新卡自动选中，框跟着挂到新卡下面 — dispatched
      // synchronously, BEFORE the `await` below, so the selection change
      // (and therefore `GenerateComposer`'s selection-derived `host`) lands
      // in the same render pass as the caller's own optimistic draft reset.
      // Builds the change set from `previouslySelectedIds` (captured above)
      // + `targetIds` (already in hand) instead of re-reading
      // `workflow.nodes` — see that snapshot's own comment for why. Same
      // selection-change INTENT `handleFocusNode` implements, minus
      // fitView (an iterate-fast loop like this shouldn't also yank the
      // camera every send).
      const focusId = targetIds[targetIds.length - 1]
      if (focusId) {
        const affectedIds = Array.from(
          new Set([...previouslySelectedIds, ...targetIds]),
        )
        workflow.onNodesChange(
          affectedIds.map((id) => ({
            id,
            type: 'select' as const,
            selected: id === focusId,
          })),
        )
      }

      const advancedParams: AdvancedParams | undefined =
        input.imageResolution !== 'auto'
          ? { resolution: input.imageResolution }
          : undefined

      // §7 owner 2026-07-28 真机实测缺陷①：必须串行，不能并发。
      // MAX_ACTIVE_JOBS_PER_USER（constants/config.ts:571）是平台硬限——旧实现
      // 用 Promise.all 并发发起 N 个 /api/studio/generate，batchCount=4 时后两
      // 个必吃 ACTIVE_GENERATION_LIMIT_EXCEEDED 429（owner 真机实测复现：只出
      // 2 张）。生成入参里也没有「一次请求出 N 张」这条路可走。改成前一个落地
      // （成功/挂起/失败任一终态）再发下一个——不能改成"一次发 2 个顶满限
      // 额"：用户在别处（studio / 其它节点）的生成同样占这 2 个名额，顶满等于
      // 把别处挤死。每个 target 的卡仍然通过 SAME 五态（canvas-image-card.md
      // §3）独立展示 running → done/failed，这里不加第二套进度 UI。
      for (const targetId of targetIds) {
        const result = await nodeMediaGeneration.generate(
          {
            kind: NODE_MEDIA_KIND_IDS.image,
            modelId: input.model.modelId,
            apiKeyId: input.model.apiKeyId,
            prompt: input.prompt,
            aspectRatio: input.aspectRatio,
            referenceImages:
              referenceImages.length > 0 ? referenceImages : undefined,
            advancedParams,
          },
          {
            onJobCreated: (jobId) =>
              workflow.updateNodeData(targetId, { mediaJobId: jobId }),
          },
        )

        if (result.success) {
          // 包 6 ①-bis：**故意不标待审**。编辑框发送是用户亲手发起的生成（这里
          // 还是他自己设的 batchCount 连发），已经是一次确认。助手不走这条路 ——
          // 它的 generate op 只调 `handleGenerateMediaNode`。别加回来。
          workflow.updateNodeData(targetId, {
            generationError: undefined,
            generationId: result.generation.id,
            generationStatus: NODE_GENERATION_STATUS_IDS.success,
            imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
            imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
            sourceGenerationId: undefined,
            sourceLabel: undefined,
            mediaJobId: undefined,
            mediaKind: NODE_MEDIA_KIND_IDS.image,
            mediaUrl: result.mediaUrl,
            // ⚠ 包 4.5：**不再**把 `generation.model` 写进 `mediaLabel`。
            // `mediaLabel` 是显示名字段（卡面标签 / 卡匣 / 助手 payload 全读它），
            // 把模型 id 写进去等于替用户起了个名 —— 一张从没被命名过的生成图，
            // 在助手眼里就叫 `gemini-3.1-flash-image-preview`。模型信息本来就还在
            // `data.model` 与 `generationId` 指向的 Generation 记录上，这里是冗余。
            lastSeed:
              typeof result.generation.seed === 'number'
                ? result.generation.seed
                : undefined,
            status: NODE_STATUS_IDS.done,
          })
          toast.success(t('toasts.mediaGenerated'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
          continue
        }

        if (result.pending) {
          workflow.updateNodeData(targetId, {
            generationError: undefined,
            generationStatus: NODE_GENERATION_STATUS_IDS.pending,
            mediaJobId: result.jobId,
            mediaKind: NODE_MEDIA_KIND_IDS.image,
            status: NODE_STATUS_IDS.running,
          })
          toast.info(t('toasts.stillProcessing'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
          continue
        }

        const failureMessage = getGenerationErrorMessage(
          tErrors,
          result,
          t('mediaNodes.fallbackError'),
        )
        workflow.updateNodeData(targetId, {
          generationError: failureMessage,
          generationStatus: NODE_GENERATION_STATUS_IDS.error,
          imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
          mediaJobId: undefined,
          mediaKind: NODE_MEDIA_KIND_IDS.image,
          status: NODE_STATUS_IDS.failed,
        })
        toast.error(t('toasts.mediaGenerationFailed'), {
          description: failureMessage,
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
      }

      return targetIds
    },
    [nodeMediaGeneration, t, tErrors, workflow],
  )

  /**
   * 审阅里的「打回 → 改词再来」（包 6 ③ + ⑥）。
   *
   * 两件事必须在同一处做，所以是一个高层动作而不是两个原语的组合：
   *   ① 把改词并进节点提示词（用户之后在卡上看得到自己改了什么）
   *   ② 用**合并后的**词立刻重跑，且来源算**助手** —— 结果因此重新回到待审队列，
   *      审阅循环闭合（⑥ 的理由：改词再来时决定的仍然是 AI）
   *
   * ⚠ 合并结果是**递**给生成函数的，不是写完再让它自己读。`updateNodeData` 是
   * setState，同一 tick 读不到自己刚写的值。
   */
  const handleRegenerateForReview = useCallback(
    async (nodeId: string, promptAppend?: string) => {
      const node = workflow.nodes.find((item) => item.id === nodeId)
      if (!node) return
      const appended = promptAppend?.trim()
      const merged = appended
        ? [node.data.prompt?.trim(), appended].filter(Boolean).join('\n')
        : undefined
      if (merged !== undefined) {
        workflow.updateNodeData(nodeId, { prompt: merged })
      }
      await handleGenerateMediaNode(
        nodeId,
        NODE_GENERATION_SOURCE_IDS.assistant,
        merged,
      )
    },
    [handleGenerateMediaNode, workflow],
  )

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const targetNode = workflow.nodes.find((node) => node.id === nodeId)
      if (!targetNode) {
        return
      }

      const selectionChanges: NodeChange<NodeWorkflowNode>[] =
        workflow.nodes.map((node) => ({
          id: node.id,
          type: 'select',
          selected: node.id === nodeId,
        }))

      workflow.onNodesChange(selectionChanges)
      void fitView({
        nodes: [{ id: nodeId }],
        duration: NODE_STUDIO_DOCK.focusDurationMs,
        maxZoom: NODE_STUDIO_DOCK.focusZoom,
      })
    },
    [fitView, workflow],
  )

  // 包 6 片 2 显式审阅模式。队列是从 `workflow.nodes` 推出来的派生量，所以实例只
  // 能有一个，住在这里，经 context 给模式条 / 顶栏徽标 / 助手 dock 共用。
  // 「相机自动飞到那张」直接复用 `handleFocusNode`（选中 + fitView），不另造一套
  // 相机动作 —— D2 消除「找」的成本靠的就是这一下。
  const reviewMode = useNodeReviewMode({
    nodes: workflow.nodes,
    focusNode: handleFocusNode,
  })
  reviewModeRef.current = reviewMode

  // 进入①：助手铺完一批之后的提示行。`assistantBatchMark` 由
  // `handleRunAssistantCanvasOps` 递增（那里读不到新鲜的待审数，见那边的说明），
  // 这里在新一轮渲染上读到真正的队列长度再提示，一批只提示一次。
  useEffect(() => {
    if (assistantBatchMark === 0) return
    if (assistantBatchNoticeRef.current === assistantBatchMark) return
    if (reviewMode.remaining === 0) return
    assistantBatchNoticeRef.current = assistantBatchMark
    toast(t('topbar.startReview', { count: reviewMode.remaining }), {
      action: {
        label: t('reviewMode.title'),
        onClick: () => reviewMode.enter(),
      },
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [assistantBatchMark, reviewMode, t])

  // 进入的第三条：快捷键。①助手铺完的提示行、②顶栏待审徽标在别处。
  // 三条进入 + 三条退出（Esc / 审完自动退 / 模式内「退出审阅」按钮），缺一不可
  // ——否则会出现「困在审阅里」的经典 bug（②-A 的硬条件）。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ⚠ 比 `key === 'R'` 宽：按下 Shift 时 `key` 到底是 'R' 还是 'r' 取决于
      // 键盘布局与 CapsLock，真机实测就撞上过（自动化按 shift+r 时收到的是 'r'）。
      // 显式排掉 Ctrl/Meta/Alt —— Ctrl+Shift+R 是浏览器硬刷新，不能抢。
      if (
        event.key.toLowerCase() !== 'r' ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      ) {
        return
      }
      // 在输入框里打字时不抢键。
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      const review = reviewModeRef.current
      if (!review) return
      event.preventDefault()
      if (review.active) review.exit()
      else review.enter()
    }
    // ⚠ **capture 相**。真机实测：普通字母键在 window 的**冒泡**相根本收不到，
    // 路上有人 stopPropagation（Esc 能收到，所以不是全局吞键）。捕获相是唯一
    // 稳的挂法 —— 别为了跟下面的 Esc 链写法一致改回冒泡。
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  useEffect(() => {
    if (!isLoaded || !userId || !workflow.isHydrated || !imageEditHandoff) {
      activeImageEditRequestKeyRef.current = null
      pendingImageEditRequestKeyRef.current = null
      return
    }

    const requestKey = getCanvasImageEditHandoffRequestKey(
      userId,
      workflow.currentProjectId,
      imageEditHandoff.signature,
    )
    const rememberedNodeId = imageEditNodeByRequestRef.current.get(requestKey)
    const rememberedNode = rememberedNodeId
      ? workflow.nodes.find((node) => node.id === rememberedNodeId)
      : undefined

    const sessionDecision = decideCanvasImageEditHandoffSession({
      requestKey,
      activeRequestKey: activeImageEditRequestKeyRef.current,
      pendingRequestKey: pendingImageEditRequestKeyRef.current,
      rememberedNodeId,
      rememberedNodeExists: rememberedNode !== undefined,
    })
    if (sessionDecision.kind === 'skip') return
    if (sessionDecision.kind === 'focus') {
      pendingImageEditRequestKeyRef.current = null
      activeImageEditRequestKeyRef.current = requestKey
      handleFocusNode(sessionDecision.nodeId)
      return
    }
    if (sessionDecision.staleNodeId) {
      imageEditNodeByRequestRef.current.delete(requestKey)
    }

    const resolution = resolveCanvasImageEditHandoff(
      workflow.nodes,
      imageEditHandoff,
    )
    if (resolution.kind === 'reuse') {
      imageEditNodeByRequestRef.current.set(requestKey, resolution.nodeId)
      pendingImageEditRequestKeyRef.current = null
      activeImageEditRequestKeyRef.current = requestKey
      handleFocusNode(resolution.nodeId)
      return
    }

    const newNodeId = workflow.addNode(
      NODE_TYPE_IDS.image,
      NODE_STUDIO_NODE_PLACEMENT.topbarAddPosition,
    )
    if (Object.keys(resolution.patch).length > 0) {
      workflow.updateNodeData(newNodeId, resolution.patch)
    }
    // The next render sees the newly created node, then performs selection
    // and fitView through the same remembered-node path. Detail stays closed;
    // only an explicit expand button may open it.
    imageEditNodeByRequestRef.current.set(requestKey, newNodeId)
    pendingImageEditRequestKeyRef.current = requestKey
  }, [handleFocusNode, imageEditHandoff, isLoaded, userId, workflow])

  // §7.1 部门条 ＋添加位: create an upstream reference node from an already
  // resolved asset (uploaded or picked from the library) and wire it into the
  // target video node. Reuses createDefaultNodeData (same role-stamp-on-
  // creation helper CastDock's ＋新建 and the add-menu's 镜头图 row use), and
  // mirrors NodeMediaInspector's existing-image field set so the spawned node
  // reads as "已有素材" not a blank generator.
  const handleSpawnReference = useCallback(
    (input: SpawnReferenceInput): string => {
      const target = workflow.nodes.find(
        (node) => node.id === input.targetNodeId,
      )
      const existingUpstream = getUpstreamNodes(
        input.targetNodeId,
        workflow.edges,
        workflow.nodes,
      ).length
      const anchor =
        target?.position ?? NODE_STUDIO_NODE_PLACEMENT.topbarAddPosition
      const position = {
        x: anchor.x + NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.offsetX,
        y:
          anchor.y +
          existingUpstream *
            NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.rowOffsetY,
      }

      const newId = workflow.addNode(input.nodeType, position)
      const name = input.media.name?.trim()

      if (input.nodeType === NODE_TYPE_IDS.image && input.role) {
        // Subject-name props are schema fields accessed directly as
        // node.data.characterName/backgroundName/shotName (not in
        // NODE_WORKFLOW_FIELD_IDS, which only covers prompt-builder fields).
        const roleNameField =
          input.role === NODE_IMAGE_ROLE_IDS.character ||
          input.role === NODE_IMAGE_ROLE_IDS.closeup
            ? 'characterName'
            : input.role === NODE_IMAGE_ROLE_IDS.background
              ? 'backgroundName'
              : 'shotName'
        workflow.updateNodeData(newId, {
          ...createDefaultNodeData(NODE_IMAGE_ROLE_TO_LEGACY_TYPE[input.role]),
          role: input.role,
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
          mediaKind: NODE_MEDIA_KIND_IDS.image,
          mediaUrl: input.media.url,
          mediaLabel: name,
          sourceLabel: name,
          sourceGenerationId: input.media.generationId,
          generationId: input.media.generationId,
          generationStatus: NODE_GENERATION_STATUS_IDS.success,
          status: NODE_STATUS_IDS.done,
          ...(name ? { [roleNameField]: name } : {}),
        })
      } else if (input.nodeType === NODE_TYPE_IDS.voice) {
        workflow.updateNodeData(newId, {
          voiceReferenceAudioUrl: input.media.url,
          status: NODE_STATUS_IDS.done,
          ...(name ? { [NODE_WORKFLOW_FIELD_IDS.voiceName]: name } : {}),
        })
      } else if (input.nodeType === NODE_TYPE_IDS.videoReference) {
        workflow.updateNodeData(newId, {
          mediaUrl: input.media.url,
          videoThumbnailUrl: input.media.thumbnailUrl,
          mediaLabel: name,
          status: NODE_STATUS_IDS.done,
        })
      }

      workflow.onConnect({
        source: newId,
        target: input.targetNodeId,
        sourceHandle: null,
        targetHandle: null,
      })

      return newId
    },
    [workflow],
  )

  // Cast dock "＋新建" (S5a §6.2): character/background spawn a unified
  // `image` node and stamp its role immediately (same role-preset-on-
  // creation pattern the add-menu's 镜头图 row uses, S5d ③ — no on-canvas
  // role chooser exists anymore to skip); voice/videoReference spawn their own
  // node type directly (no role to preset). New nodes stagger vertically off
  // the shared topbar-add anchor (reusing the same offset the ＋添加位
  // autospawn uses) so repeated clicks don't stack exact duplicates, then get
  // focused so the dock's action has visible on-canvas feedback.
  const handleFocusGeneratedNodes = useCallback(() => {
    if (workflow.nodes.length === 0) return
    window.setTimeout(() => {
      void fitView({
        duration: NODE_STUDIO_DOCK.focusDurationMs,
        maxZoom: NODE_STUDIO_DOCK.focusZoom,
        padding: 0.16,
      })
    }, 0)
  }, [fitView, workflow.nodes.length])

  // Open-Image-Studio return: the user generated in Studio and tapped "回填".
  // Apply the result to the origin node once the graph (and that node) has
  // loaded, then clear the handoff. The ref guards against re-applying; when a
  // result exists but the node hasn't loaded yet we leave the ref unset so the
  // effect retries as `workflow.nodes` populates.
  const appliedStudioReturnRef = useRef(false)
  useEffect(() => {
    if (appliedStudioReturnRef.current) return
    const result = readStudioNodeResult()
    if (!result) {
      appliedStudioReturnRef.current = true
      return
    }
    const target = workflow.nodes.find(
      (node) => node.id === result.originNodeId,
    )
    if (!target) return
    appliedStudioReturnRef.current = true
    workflow.updateNodeData(result.originNodeId, {
      generationError: undefined,
      generationId: result.generationId,
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      mediaUrl: result.url,
      mediaLabel: result.label,
      sourceGenerationId: result.generationId,
      sourceLabel: result.label,
      status: NODE_STATUS_IDS.done,
    })
    clearStudioNodeResult()
    toast.success(t('toasts.studioResultAttached'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [t, workflow])

  const panOnDrag = useMemo(
    () =>
      toolMode === NODE_STUDIO_TOOL_MODE_IDS.hand
        ? true
        : [...NODE_STUDIO_CANVAS.panOnDragButtons],
    [toolMode],
  )

  // 渲染退场: fold into ReactFlow `hidden` at RENDER TIME only — the data
  // model (`workflow.nodes`) this derives from is untouched, so undo/save/
  // reload all still see the real graph.
  //
  // Nodes are never hidden as a side effect of reference ownership. Legacy
  // `fusedIntoNodeId` markers are removed during hydration; keeping the render
  // input identical to the persisted node array also protects old projects
  // that are opened before their healed state is written back to the server.
  //
  // 包 6 片 2：审阅模式里给「正在审的那一张」挂一个渲染期类名，让 canvas.css 的
  // 弱化规则认得出它（§4.6「非待审弱化不隐藏，当前对象唯一强调」）。同样只在渲染
  // 期加，`workflow.nodes` 一个字都不动。⚠ 只有进了模式才 map —— 不在模式里必须
  // 原样透传同一个数组引用，否则每一帧拖拽都会重建整张节点数组。
  const reviewCurrentNodeId = reviewMode.active
    ? (reviewMode.current?.nodeId ?? null)
    : null
  const renderedNodes = useMemo(() => {
    if (!reviewCurrentNodeId) return workflow.nodes
    return workflow.nodes.map((node) =>
      node.id === reviewCurrentNodeId
        ? { ...node, className: cn(node.className, 'canvas-review-current') }
        : node,
    )
  }, [reviewCurrentNodeId, workflow.nodes])

  // R3-1 选中集合（canvas-relationship-v3 §2.2）: `workflow.nodes[].selected`
  // already round-trips through `workflow.onNodesChange` (applyNodeChanges
  // handles the 'select' change ReactFlow dispatches on click / marquee), so
  // this is a plain derived read — no separate selection store needed.
  // A1 perf fix: a signature/Set split keeps this selection projection stable —
  // `node.selected` only changes on an actual click/marquee, never on a
  // drag-frame position tick, so gating the Set behind a primitive key keeps
  // it referentially stable through an entire drag gesture.
  const selectedNodeIdsSignature = useMemo(() => {
    let signature = ''
    for (const node of workflow.nodes) {
      if (node.selected) signature += node.id + '|'
    }
    return signature
  }, [workflow.nodes])
  const selectedNodeIds = useMemo(
    () =>
      new Set(
        selectedNodeIdsSignature
          ? selectedNodeIdsSignature.split('|').filter(Boolean)
          : [],
      ),
    [selectedNodeIdsSignature],
  )

  // R3-7 (canvas-relationship-v3 §3.0b/§7, task red line): every per-node
  // selection toolbar (NodeShell / LooseImageCard, via
  // NodeWorkflowActionsContext) hides itself while 2+ nodes are selected —
  // regardless of type mix — so a marquee/shift-select never shows N
  // overlapping single-node toolbars fighting the "合成" bar below (or just
  // cluttering the canvas). Plain boolean, not its own memo: `selectedNodeIds`
  // is already the signature-gated stable Set above, so `.size` only changes
  // identity when a real selection change happened, never on a drag-frame
  // position tick.
  const multiSelectActive = selectedNodeIds.size >= 2

  // R3-7 合成资格 (§3.0b "多选视频类节点...出现「合成」入口"): the narrower,
  // type-checked subset of `multiSelectActive` — non-null only when EVERY
  // selected node is a legal videoMerge source (same connection-matrix row
  // `canConnectNodeTypes` already enforces, reused via
  // `canComposeVideoMergeSelection` so "入盒标准即现有连接矩阵不改" stays one
  // definition). A single non-video node anywhere in the selection makes
  // this null — the compose bar does not render, per the task's "混入任何非
  // 视频节点则不出现（不渲染，不是置灰）".
  const composeSelectionNodeIds = useMemo(() => {
    if (selectedNodeIds.size < 2) return null
    const selected: NodeWorkflowNode[] = []
    for (const node of workflow.nodes) {
      if (selectedNodeIds.has(node.id)) selected.push(node)
    }
    return canComposeVideoMergeSelection(selected)
      ? selected.map((node) => node.id)
      : null
  }, [selectedNodeIds, workflow.nodes])

  // R3-1「关系线」总开关（§2.5），反转 by FB-B（真机反馈拍板，
  // canvas-relationship-v3-2026-07 §2.2）: session-only, **default false =
  // 展开/全显** — every two-ends-visible edge (骨干 + 成分) renders at the
  // neutral default stroke (NOT the 石绿 revealed tint, which stays reserved
  // for selection-driven reveals, see `revealed` below). Clicking the
  // bottom-dock toggle flips this to `true` = **收起**, falling back to the
  // old default (骨干常显 / 成分仅选中或生成中显现) for a cleaner canvas.
  const [relationsCollapsed, setRelationsCollapsed] = useState(false)

  // R3-2 墨线签署/褪去 (canvas-relationship-v3 §2.7): render-layer-only
  // bookkeeping, never touching `workflow.edges`/`workflow.nodes` — a
  // `Map<pairKey, phase>` for edges currently playing their signing episode
  // (keyed by source::target, not edge id — `handleIngestConnect` doesn't
  // hand back the id `onConnect` mints internally, and the pair is unique at
  // connect time since duplicates are rejected first) and a
  // `Map<edgeId, edge>` snapshot cache for edges that were just deleted but
  // are still finishing their reverse ink retreat. Two phases, both timed
  // entirely HERE (not inside `NodeWorkflowStatusEdge`, which only ever reads
  // booleans derived from this — see that file's header comment for why):
  // 'drawing' for the ink draw-in (`inkDrawMs`), then 'fading' for the
  // optional settle fade-out (`inkHoldFadeMs`) before the pair is dropped
  // and normal §2.2 visibility resumes. `renderedEdges` below reads both
  // maps; each scheduler tracks its own pending timeouts in a parallel ref
  // map so an unmount mid-animation can't leak a timer or write state on a
  // gone component.
  const [signedEdgePairs, setSignedEdgePairs] = useState<
    Map<string, 'drawing' | 'fading'>
  >(new Map())
  const signingTimeoutsRef = useRef<
    Map<string, { drawTimeout: number; holdTimeout: number }>
  >(new Map())
  const [fadingEdges, setFadingEdges] = useState<Map<string, NodeWorkflowEdge>>(
    new Map(),
  )
  const fadingTimeoutsRef = useRef<Map<string, number>>(new Map())

  const scheduleEdgeSigning = useCallback(
    (sourceId: string, targetId: string) => {
      const pairKey = edgePairKey(sourceId, targetId)
      const existing = signingTimeoutsRef.current.get(pairKey)
      if (existing) {
        window.clearTimeout(existing.drawTimeout)
        window.clearTimeout(existing.holdTimeout)
      }

      setSignedEdgePairs((prev) => {
        const next = new Map(prev)
        next.set(pairKey, 'drawing')
        return next
      })
      const drawTimeout = window.setTimeout(() => {
        setSignedEdgePairs((prev) => {
          if (!prev.has(pairKey)) return prev
          const next = new Map(prev)
          next.set(pairKey, 'fading')
          return next
        })
      }, NODE_EDGE_SIGNING_MOTION.inkDrawMs)
      const holdTimeout = window.setTimeout(() => {
        signingTimeoutsRef.current.delete(pairKey)
        setSignedEdgePairs((prev) => {
          if (!prev.has(pairKey)) return prev
          const next = new Map(prev)
          next.delete(pairKey)
          return next
        })
      }, NODE_EDGE_SIGNING_MOTION.inkDrawMs + NODE_EDGE_SIGNING_MOTION.inkHoldFadeMs)
      signingTimeoutsRef.current.set(pairKey, { drawTimeout, holdTimeout })
    },
    [],
  )

  const scheduleEdgeUnsign = useCallback((edge: NodeWorkflowEdge) => {
    const existingTimeout = fadingTimeoutsRef.current.get(edge.id)
    if (existingTimeout !== undefined) window.clearTimeout(existingTimeout)

    setFadingEdges((prev) => {
      const next = new Map(prev)
      next.set(edge.id, edge)
      return next
    })
    const timeoutId = window.setTimeout(() => {
      fadingTimeoutsRef.current.delete(edge.id)
      setFadingEdges((prev) => {
        if (!prev.has(edge.id)) return prev
        const next = new Map(prev)
        next.delete(edge.id)
        return next
      })
    }, NODE_EDGE_SIGNING_MOTION.unsignFadeMs)
    fadingTimeoutsRef.current.set(edge.id, timeoutId)
  }, [])

  // Drop every pending timer on unmount — the state setters they close over
  // would otherwise fire after the component (or the whole canvas route) is
  // gone.
  useEffect(() => {
    const signingTimeouts = signingTimeoutsRef.current
    const fadingTimeouts = fadingTimeoutsRef.current
    return () => {
      for (const timers of signingTimeouts.values()) {
        window.clearTimeout(timers.drawTimeout)
        window.clearTimeout(timers.holdTimeout)
      }
      for (const timeoutId of fadingTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  // §2.2's "should this edge currently be on screen" check, reused (not
  // recomputed with different logic) at delete time to decide whether an
  // unbind is worth a reverse ink retreat at all — an already-hidden
  // ingredient edge (not selected, not the toggle) just disappears silently,
  // exactly like today (§2.7 "未渲染的边照旧直接删").
  const isEdgeCurrentlyVisible = useCallback(
    (edge: NodeWorkflowEdge): boolean => {
      const sourceNode = workflow.nodes.find((n) => n.id === edge.source)
      const targetNode = workflow.nodes.find((n) => n.id === edge.target)
      if (!sourceNode || !targetNode) return false
      const tier = resolveNodeEdgeTier(edge, sourceNode, targetNode)
      const endpointSelected =
        selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)
      const targetGenerating = isNodeWorkflowGenerating(
        targetNode.data.status,
        targetNode.data.generationStatus,
      )
      return resolveNodeEdgeVisibility({
        tier,
        endpointSelected,
        targetGenerating,
        relationsCollapsed,
      })
    },
    [workflow.nodes, selectedNodeIds, relationsCollapsed],
  )

  // R3-2 §2.7 解绑反放: wraps every `deleteEdge` call site that removes a
  // CURRENTLY RENDERED edge (成分栏 chip × goes through this via the
  // `NodeWorkflowActionsProvider` context below; the cut-tool's own
  // `handleEdgeClick` calls it directly) with a reverse ink retreat. Data
  // deletion is never gated on the animation — `workflow.deleteEdge` always
  // fires synchronously in the same tick; the fading copy is a purely
  // decorative render-layer echo (§2.7 "数据先删/并行, 动画只是视觉层").
  const handleDeleteEdgeWithSignOff = useCallback(
    (edgeId: string) => {
      const edge = workflow.edges.find((candidate) => candidate.id === edgeId)
      if (edge && !prefersReducedMotion() && isEdgeCurrentlyVisible(edge)) {
        scheduleEdgeUnsign(edge)
      }
      workflow.deleteEdge(edgeId)
    },
    [workflow, isEdgeCurrentlyVisible, scheduleEdgeUnsign],
  )

  // The Del/Backspace path for a SELECTED edge never goes through
  // `deleteEdge` — ReactFlow's own `deleteKeyCode` handling removes it via
  // `onEdgesChange` directly. `onEdgesDelete` fires just before that (see the
  // library's own `deleteElements`), giving this the same "snapshot before
  // it's gone" window `handleDeleteEdgeWithSignOff` gets for the other two
  // removal paths — it only snapshots for the fade; the actual removal still
  // runs through ReactFlow's normal onEdgesChange → workflow.onEdgesChange.
  const handleEdgesDelete = useCallback(
    (edges: NodeWorkflowEdge[]) => {
      if (prefersReducedMotion()) return
      for (const edge of edges) {
        if (isEdgeCurrentlyVisible(edge)) {
          scheduleEdgeUnsign(edge)
        }
      }
    },
    [isEdgeCurrentlyVisible, scheduleEdgeUnsign],
  )

  // R3-7 一键成盒 (canvas-relationship-v3 §3.0b/§7): the multi-select "合成 N
  // 段" bar's only action. Re-derives the live selected nodes from
  // `workflow.nodes` at click time (not off the `composeSelectionNodeIds`
  // memo's stale snapshot — same "read live state, not a memo, inside a
  // handler" pattern the other graph mutations use) and
  // re-validates eligibility defensively before doing anything, since a
  // marquee could in principle have changed between render and click.
  //
  // ①②: one `addNode` for the new videoMerge box, landing to the right of
  // the selection's bounding box (`NODE_STUDIO_NODE_PLACEMENT.
  // videoMergeCompose`), then one `onConnect` per selected node — the EXACT
  // same addEdge path `handleIngestConnect`/`handleSpawnReference` already
  // use, so every new edge gets the same legality/undo-history treatment as
  // a hand-drawn ingest. Build order = x-ascending spatial reading order
  // (`sortNodesForVideoMergeCompose`, y as the tiebreak) — NOTE this governs
  // the order edges are CREATED in, not (today) the order
  // `getUpstreamNodes`/`VideoMergeInspector` display clips in, since that
  // helper orders by each node's position in the `workflow.nodes` array
  // (creation order), not by edge-creation order or spatial position; a
  // follow-up would need to teach the graph an explicit order field for the
  // x-ascending guarantee to be visible end-to-end.
  //
  // ④: each new edge also gets the R3-2 墨线签署 (ink-draw-in) treatment via
  // `scheduleEdgeSigning` — the exact same scheduler `onNodeDragStop`'s
  // non-folding-source ingest path uses, so a bulk compose reads with the
  // same "手作签署" beat a one-at-a-time drag-in does, not a silent bulk
  // mutation. Skipped under `prefers-reduced-motion`, matching every other
  // signing call site.
  //
  // ③: selects + fitViews to the new box via the same `handleFocusNode` the
  // rest of the workbench uses for "just created this, look at it".
  const handleComposeVideoMerge = useCallback(() => {
    if (!composeSelectionNodeIds || composeSelectionNodeIds.length < 2) return
    const composeIds = new Set(composeSelectionNodeIds)
    const selected = workflow.nodes.filter((node) => composeIds.has(node.id))
    if (!canComposeVideoMergeSelection(selected)) return

    const ordered = sortNodesForVideoMergeCompose(selected)
    const bounds = ordered.reduce(
      (acc, node) => ({
        maxX: Math.max(acc.maxX, node.position.x),
        minY: Math.min(acc.minY, node.position.y),
      }),
      { maxX: -Infinity, minY: Infinity },
    )
    const position = {
      x: bounds.maxX + NODE_STUDIO_NODE_PLACEMENT.videoMergeCompose.offsetX,
      y: bounds.minY,
    }

    const newNodeId = workflow.addNode(NODE_TYPE_IDS.videoMerge, position)
    const skipSigning = prefersReducedMotion()
    for (const node of ordered) {
      workflow.onConnect({
        source: node.id,
        target: newNodeId,
        sourceHandle: null,
        targetHandle: null,
      })
      if (!skipSigning) {
        scheduleEdgeSigning(node.id, newNodeId)
      }
    }

    toast.success(t('toasts.videoMergeComposed', { count: ordered.length }), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
    handleFocusNode(newNodeId)
  }, [
    composeSelectionNodeIds,
    handleFocusNode,
    scheduleEdgeSigning,
    t,
    workflow,
  ])

  // A1 perf fix: `renderedEdges` below only reads THREE things off each node
  // via `nodeById` — `type`/`data.role` (tier resolution) and
  // `data.status`/`data.generationStatus` (the "is this edge's target
  // generating" pulse) — none of which move during a plain position drag.
  // Depending on this cheap signature instead of raw `workflow.nodes` keeps
  // the whole edges-array rebuild (and every edge component's props) stable
  // across drag frames, using the same signature strategy as
  // `selectedNodeIdsSignature` above.
  const edgeRelevantNodesSignature = useMemo(() => {
    let signature = ''
    for (const node of workflow.nodes) {
      signature +=
        node.id +
        ':' +
        node.type +
        ':' +
        (node.data.role ?? '') +
        ':' +
        (node.data.status ?? '') +
        ':' +
        (node.data.generationStatus ?? '') +
        '|'
    }
    return signature
  }, [workflow.nodes])

  // 连线渲染: §2.2 条件矩阵 replaces the old unconditional `hidden: true`. A
  // backbone edge (制片流) is always shown; an ingredient edge (供给关系)
  // FB-B 反转后默认（`relationsCollapsed === false`）也全部显示 — only the
  // 「关系线」toggle's **收起** state (`relationsCollapsed === true`) narrows
  // it back to "an endpoint selected / target generating / mid-签署 only".
  // `revealed` is stamped onto the edge's `data` for the selection-driven AND
  // the signing case alike, in EITHER toggle state — both get the 石绿 tint
  // (NodeWorkflowStatusEdge reads it); the default-visible neutral stroke is
  // not tinted. Every edge still goes through this map — `useEdges()`
  // consumers (成分栏 / ReferenceManagerPanel / CastDock 计数 / inspectors)
  // read the render store, not `workflow.edges`, so an empty/filtered array
  // here would starve them (existing warning, still true).
  const renderedEdges = useMemo<NodeWorkflowEdge[]>(() => {
    const nodeById = new Map(
      workflow.nodes.map((node) => [node.id, node] as const),
    )
    const liveEdges = workflow.edges.map((edge) => {
      const sourceNode = nodeById.get(edge.source)
      const targetNode = nodeById.get(edge.target)
      if (!sourceNode || !targetNode) {
        return { ...edge, hidden: true }
      }

      const tier = resolveNodeEdgeTier(edge, sourceNode, targetNode)
      const endpointSelected =
        selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)
      const targetGenerating = isNodeWorkflowGenerating(
        targetNode.data.status,
        targetNode.data.generationStatus,
      )
      const underlyingShouldRender = resolveNodeEdgeVisibility({
        tier,
        endpointSelected,
        targetGenerating,
        relationsCollapsed,
      })

      // R3-2 §2.7: an edge mid-签署 is forced visible for the whole ink-draw
      // ('drawing') + settle-fade ('fading') hold window regardless of the
      // §2.2 answer above. The settle fade-out class only ever gets attached
      // when `underlyingShouldRender` is ALSO false at 'fading' time — read
      // fresh every render, so if the user selects the node mid-window the
      // fade simply never gets stamped (no explicit "cancel" needed).
      const signingPhase = signedEdgePairs.get(
        edgePairKey(edge.source, edge.target),
      )
      const isSigning = signingPhase !== undefined
      const shouldRender = underlyingShouldRender || isSigning
      if (!shouldRender) {
        return { ...edge, hidden: true }
      }

      const revealed =
        (tier === NODE_EDGE_TIER_IDS.ingredient && endpointSelected) ||
        isSigning
      return {
        ...edge,
        hidden: false,
        data: {
          ...edge.data,
          ...(revealed ? { revealed: true } : {}),
          ...(signingPhase === 'drawing' ? { justSigned: true } : {}),
          ...(signingPhase === 'fading' && !underlyingShouldRender
            ? { signingFadeOut: true }
            : {}),
        },
      }
    })

    if (fadingEdges.size === 0) {
      return liveEdges
    }

    // R3-2 §2.7 解绑反放: append a decorative echo of each just-deleted edge
    // still finishing its reverse ink retreat. Guarded by id so an edge that
    // somehow still exists in `workflow.edges` (shouldn't happen — the fade
    // cache is only ever populated right before `workflow.deleteEdge`/the
    // library's own removal fires) never double-renders.
    const liveIds = new Set(liveEdges.map((edge) => edge.id))
    const fadingRendered: NodeWorkflowEdge[] = []
    for (const edge of fadingEdges.values()) {
      if (liveIds.has(edge.id)) continue
      const sourceNode = nodeById.get(edge.source)
      const targetNode = nodeById.get(edge.target)
      if (!sourceNode || !targetNode) continue
      fadingRendered.push({
        ...edge,
        hidden: false,
        data: { ...edge.data, unsigning: true },
      })
    }
    return fadingRendered.length > 0
      ? [...liveEdges, ...fadingRendered]
      : liveEdges
    // `edgeRelevantNodesSignature` stands in for `workflow.nodes` here (the
    // memo body still reads the latter via closure to build `nodeById`) — it
    // changes iff a node's id/type/role/status/generationStatus actually
    // changes, so a pure position-drag frame (new `workflow.nodes` array
    // reference, same relevant fields) correctly skips this rebuild. See the
    // signature memo above for exactly what it tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workflow.edges,
    edgeRelevantNodesSignature,
    selectedNodeIds,
    relationsCollapsed,
    signedEdgePairs,
    fadingEdges,
  ])

  // S11（2026-07-27）更正：上面这条注释描述的是 grid-squeeze 时代的行为，
  // 已经不成立——助手浮动化之后 .stage 恒为 .workspace 的 100%，不再替
  // 底部工具条免费挡掉助手的宽度，所以这里必须重新显式让位（同顶栏右侧
  // 按钮簇的算法，见 canvas.css S11）。right = 16px（这一行自己的留白）+
  // 助手当前宽度，让胶囊行的右边界正好卡在助手卡左边界。
  // --canvas-assistant-width 定义在 CanvasWorkspaceLayout.module.css 的
  // .workspace 上，这个 div 是它的后代（CanvasWorkspaceLayout 把
  // StudioNodeCanvas 的整个 children 树挂在 .workspace > .stage 内），所以
  // 能原样继承读到——不在 JS 里复算/硬编码一份宽度数字，单一数据源仍是
  // CSS 变量。闭合态该变量为 0px，算出来的 right 精确回落到原来的 16px，
  // 零回归。left 恒定 16px：左侧没有任何东西会浮出来挡它，不需要让位。
  const bottomRowInsetPx = {
    left: NODE_STUDIO_BOTTOM_DOCK.canvasInsetPx,
    right: `calc(${NODE_STUDIO_BOTTOM_DOCK.canvasInsetPx}px + var(--canvas-assistant-width, 0px))`,
  }

  // 落卡 = 建边（B1-4）: the ingest engine's ONLY data mutation, reusing the
  // exact same addEdge path onConnect already uses (idempotent — a duplicate
  // source→target is rejected before this is ever called, see
  // use-cast-ingest.ts's evaluateCastIngest).
  const handleIngestConnect = useCallback(
    (sourceId: string, targetId: string) => {
      workflow.onConnect({
        source: sourceId,
        target: targetId,
        sourceHandle: null,
        targetHandle: null,
      })
    },
    [workflow],
  )

  const listConnectableReferences = useCallback(
    (targetNodeId: string): NodeWorkflowNode[] => {
      const target = workflow.nodes.find((node) => node.id === targetNodeId)
      if (!target) return []
      return workflow.nodes.filter(
        (source) =>
          evaluateCastIngest(source, target, workflow.edges, workflow.nodes)
            .legal,
      )
    },
    [workflow.edges, workflow.nodes],
  )

  // S5f A: same wording table `IngestDragLayer`'s Cast-dock pointer engine
  // uses (`StudioNode.ingest.reasons.*`) — reused here (not re-worded) so a
  // 咬不动 rejection reads identically whether the drag started from the Cast
  // dock or from a native canvas node.
  const translateIngestReason = useCallback(
    (evaluation: CastIngestEvaluation): string => {
      switch (evaluation.reason) {
        case NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate:
          return t('ingest.reasons.duplicate')
        case NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull:
          return evaluation.limit !== undefined &&
            evaluation.current !== undefined
            ? t('ingest.reasons.capacityFullWithLimit', {
                current: evaluation.current,
                limit: evaluation.limit,
              })
            : t('ingest.reasons.capacityFull')
        default:
          return t('ingest.reasons.typeMismatch')
      }
    },
    [t],
  )

  const connectReferenceNode = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      const source = workflow.nodes.find((node) => node.id === sourceNodeId)
      const target = workflow.nodes.find((node) => node.id === targetNodeId)
      if (!source || !target) return
      const evaluation = evaluateCastIngest(
        source,
        target,
        workflow.edges,
        workflow.nodes,
      )
      if (!evaluation.legal) {
        toast.error(t('ingest.canvasNodeIngestRejected'), {
          description: translateIngestReason(evaluation),
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      handleIngestConnect(sourceNodeId, targetNodeId)
      handleFocusNode(sourceNodeId)
    },
    [
      handleFocusNode,
      handleIngestConnect,
      t,
      translateIngestReason,
      workflow.edges,
      workflow.nodes,
    ],
  )

  /**
   * 包 5 助手写画布的**执行端**。合法性早在 `planNodeAssistantOps` 判完，这里
   * 只负责把 ready 的 op 变成真的图改动 —— 走的全是人手也在走的那几个动作
   * （`createCanvasObject` / `handleIngestConnect` / `updateNodeData` /
   * `handleGenerateMediaNode`），一处也不直接碰 `NodeWorkflowProject.state`。
   *
   * ⚠ 两个跟 React 有关的约束，决定了下面为什么要自己记账：
   * ① 图的写入都是 `setState` 的函数式更新，**同一 tick 内读不回来**。所以本批
   *    新建节点的 id、身份（role/type）、以及累积的 data 补丁，都只能在本地
   *    Map 里跟着走（`spawnReference` 走的是同一条路，只是它只建一个）。
   * ② `workflow.nodes` 是本次渲染的快照。对**已有**节点它是准的，对本批刚建的
   *    节点它永远是空的 —— 凡是要读节点身份的 op（改名 / 审核）都得先查本地账
   *    本，再回落到快照。
   */
  const handleRunAssistantCanvasOps = useCallback(
    async (
      ops: readonly PlannedNodeAssistantOp[],
    ): Promise<NodeAssistantOpRunResult> =>
      // B2.5：**整批只占一个撤销步**。实测过改之前的行为：应用「3 项」后按撤销是
      // 3→2→1→0，一次退一个（`assistant-ab-design-2026-08-08.md` §B2）。一批 op 是
      // 一次用户决定，退它就该是一次动作。
      workflow.runAsSingleHistoryStep(async () => {
        const { assistantSpawn, topbarAddPosition } = NODE_STUDIO_NODE_PLACEMENT
        // 整批落在现有图右侧，再按网格铺开：固定落点会直接压在已有节点上。
        const anchor =
          workflow.nodes.length === 0
            ? topbarAddPosition
            : {
                x:
                  Math.max(...workflow.nodes.map((node) => node.position.x)) +
                  assistantSpawn.anchorGapX,
                y: Math.min(...workflow.nodes.map((node) => node.position.y)),
              }

        const realIdByRef = new Map<string, string>()
        const identityById = new Map<
          string,
          { role?: NodeImageRole; type: NodeWorkflowNodeType }
        >()
        const dataOverrideById = new Map<
          string,
          Partial<NodeWorkflowNodeData>
        >()
        const createdNodeIds: string[] = []
        let applied = 0
        let skipped = 0
        /** 这一批里真的跑了几次生成 —— 只有它 >0 才值得提示「去审吧」。 */
        let generated = 0

        const resolveNodeId = (
          reference: NodeAssistantOpNodeRef | undefined,
        ): string | undefined => {
          if (!reference) return undefined
          return reference.kind === 'existing'
            ? reference.nodeId
            : realIdByRef.get(reference.ref)
        }

        const resolveIdentity = (nodeId: string) => {
          const created = identityById.get(nodeId)
          if (created) return created
          const node = workflow.nodes.find(
            (candidate) => candidate.id === nodeId,
          )
          return node ? { role: node.data.role, type: node.type } : undefined
        }

        for (const entry of ops) {
          // 用户可能只勾了一部分；被剔掉的 add_node 会让引用它的 op 在这里落空。
          if (entry.status !== 'ready') {
            skipped += 1
            continue
          }
          const { op } = entry

          if (op.op === NODE_ASSISTANT_OP_IDS.addNode) {
            const seq = createdNodeIds.length
            const position = {
              x:
                anchor.x +
                (seq % assistantSpawn.columns) * assistantSpawn.columnOffsetX,
              y:
                anchor.y +
                Math.floor(seq / assistantSpawn.columns) *
                  assistantSpawn.rowOffsetY,
            }
            const newId = createCanvasObject(op.intent, position)
            const item = getCanvasAddCatalogItem(op.intent)
            identityById.set(newId, { role: item.role, type: item.nodeType })
            if (op.name) {
              workflow.updateNodeData(
                newId,
                buildDisplayNamePatch(
                  { role: item.role, type: item.nodeType },
                  op.name,
                ),
              )
            }
            // B1 / A3：助手写进来的提示词。落的是节点自己的 `prompt` 字段 —— 与人手
            // 在同一个框里打字完全等价，不另设一套「助手写的提示词」通道。
            if (op.prompt) {
              workflow.updateNodeData(newId, { prompt: op.prompt })
            }
            if (op.ref) realIdByRef.set(op.ref, newId)
            createdNodeIds.push(newId)
            applied += 1
            continue
          }

          if (op.op === NODE_ASSISTANT_OP_IDS.connect) {
            const sourceId = resolveNodeId(entry.source)
            const targetId = resolveNodeId(entry.target)
            if (!sourceId || !targetId) {
              skipped += 1
              continue
            }
            handleIngestConnect(sourceId, targetId)
            applied += 1
            continue
          }

          if (op.op === NODE_ASSISTANT_OP_IDS.rename) {
            const targetId = resolveNodeId(entry.target)
            const identity = targetId ? resolveIdentity(targetId) : undefined
            if (!targetId || !identity) {
              skipped += 1
              continue
            }
            // 走包 4.5 的写侧事实源 —— 名字该落 characterName 还是 shotName 只有
            // 那一处说了算，助手这条路不新开第五份副本。
            workflow.updateNodeData(
              targetId,
              buildDisplayNamePatch(identity, op.name),
            )
            applied += 1
            continue
          }

          if (op.op === NODE_ASSISTANT_OP_IDS.setReviewState) {
            const targetId = resolveNodeId(entry.target)
            const node = targetId
              ? workflow.nodes.find((candidate) => candidate.id === targetId)
              : undefined
            if (!targetId || !node || !entry.mediaUrl) {
              skipped += 1
              continue
            }
            // 同一批里对同一节点标两次时，第二次要看得见第一次写的 mediaReview
            // ——快照读不到，所以补丁在本地累积后再合并。
            const base: NodeWorkflowNodeData = {
              ...node.data,
              ...dataOverrideById.get(targetId),
            }
            const reviewedAt = new Date().toISOString()
            const patch =
              op.state === NODE_REVIEW_STATE_IDS.rejected
                ? rejectMedia(base, entry.mediaUrl, {
                    reviewedAt,
                    ...(op.reason ? { reason: op.reason } : {}),
                  })
                : markMediaAwaitingReview(base, entry.mediaUrl, {
                    markedAt: reviewedAt,
                  })
            dataOverrideById.set(targetId, {
              ...dataOverrideById.get(targetId),
              ...patch,
            })
            workflow.updateNodeData(targetId, patch)
            applied += 1
            continue
          }

          // generate —— 唯一扣 credit 的 op，UI 已单独确认过一次。规划器保证目标
          // 是已有节点且选了模型（本批刚建的节点没有模型，一定被判 noModel），
          // 所以这里不必再对付「快照里没有」的情况。
          const targetId = resolveNodeId(entry.target)
          if (!targetId) {
            skipped += 1
            continue
          }
          // 包 6 ①-bis：**这里是待审队列唯一的入口**。来源显式传，不靠环境推断。
          await handleGenerateMediaNode(
            targetId,
            NODE_GENERATION_SOURCE_IDS.assistant,
          )
          generated += 1
          applied += 1
        }

        if (createdNodeIds[0]) handleFocusNode(createdNodeIds[0])

        // 包 6 片 2 进入①：助手铺完一批 → 直接问「要不要现在审」。
        // 只打个标记、把提示留给下面的 effect：这个闭包里的 `workflow.nodes` 还是
        // 生成之前的快照，在这儿数待审数量必然读到旧值。
        if (generated > 0) setAssistantBatchMark((mark) => mark + 1)

        return { applied, skipped, createdNodeIds }
      }),
    [
      createCanvasObject,
      handleFocusNode,
      handleGenerateMediaNode,
      handleIngestConnect,
      workflow,
    ],
  )

  // §6 connection contract: reject self-loops and any (source→target) node-type
  // pair the strict matrix doesn't allow. Existing edges aren't affected — this
  // only gates new connection attempts.
  const isValidConnection = useCallback(
    (connection: Connection | NodeWorkflowEdge): boolean => {
      const { source, target } = connection
      if (!source || !target || source === target) return false
      const sourceNode = workflow.nodes.find((node) => node.id === source)
      const targetNode = workflow.nodes.find((node) => node.id === target)
      if (!sourceNode || !targetNode) return false
      return canConnectNodeTypes(
        sourceNode.type,
        targetNode.type,
        targetNode.data.role,
        sourceNode.data.role,
      )
    },
    [workflow.nodes],
  )

  const handleEdgeClick = useCallback(
    (event: ReactMouseEvent, edge: NodeWorkflowEdge) => {
      if (toolMode !== NODE_STUDIO_TOOL_MODE_IDS.cut) {
        return
      }

      event.stopPropagation()
      handleDeleteEdgeWithSignOff(edge.id)
      toast.success(t('toasts.edgeDeleted'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [handleDeleteEdgeWithSignOff, t, toolMode],
  )

  // Legacy nested references can still be removed without reintroducing the
  // retired hide/fuse model. If the original canvas node exists it is already
  // visible, so deleting the nested copy is the entire operation. Otherwise
  // preserve the old lossless fallback and materialize a new loose node.
  const handleExtractReference = useCallback(
    (nodeId: string, referenceId: string) => {
      const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return
      const references = node.data.referenceAssets ?? []
      const reference = references.find((entry) => entry.id === referenceId)
      if (!reference) return

      workflow.updateNodeData(nodeId, {
        referenceAssets: references.filter((entry) => entry.id !== referenceId),
      })

      if (
        reference.source === NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas &&
        reference.sourceId
      ) {
        const originNodeId = reference.sourceId
        const originStillExists = workflow.nodes.some(
          (candidate) => candidate.id === originNodeId,
        )
        if (originStillExists) {
          return
        }
        // Origin node was deleted independently — fall through and
        // materialize a fresh loose node from the still-good url below.
      }

      const viewportCenter = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const newNodeId = workflow.addNode(NODE_TYPE_IDS.image, viewportCenter)
      workflow.updateNodeData(newNodeId, {
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        mediaUrl: reference.url,
        mediaLabel: reference.name,
        sourceLabel: reference.name,
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        status: NODE_STATUS_IDS.done,
      })
    },
    [screenToFlowPosition, workflow],
  )

  // 【紧急修复】融合三拍动画补齐 (owner 2026-07-10 实测反馈①), S5f A 扩面
  // (2026-07-11): the fusion gesture (and now the general canvas-node ingest
  // gesture below) ride ReactFlow's native node drag, which has no per-frame
  // hook of its own — `onNodeDrag` fires continuously while ANY node drags,
  // so this hit-tests + applies/clears 张口 (bite hover) on the current legal
  // target, mirroring `use-cast-ingest.ts`'s own pointer-move bite logic via
  // the SAME exported `applyBiteHover`/`clearBiteHover`/`findNodeCardElement`
  // helpers (no second curve invented). Tracked in refs (not state) — this
  // fires every pointer-move-equivalent frame, a state write here would
  // thrash re-renders across the whole canvas.
  const fuseBiteTargetIdRef = useRef<string | null>(null)
  const fuseBiteTargetElRef = useRef<HTMLElement | null>(null)

  // A1 perf (canvas-relationship-v3-2026-07 §7b): `dragRectCacheRef` holds
  // `buildCanvasDragRectCache`'s snapshot for the CURRENT drag (empty when
  // none is in flight); `dragRafIdRef`/`pendingDragPointerRef` coalesce
  // `handleNodeDrag`'s hover-preview hit-test to at most once per animation
  // frame instead of once per native pointermove (see both functions' doc
  // comments above for the full reasoning).
  const dragRectCacheRef = useRef<CanvasDragRectEntry[]>([])
  const dragRafIdRef = useRef<number | null>(null)
  const pendingDragPointerRef = useRef<{
    clientX: number
    clientY: number
    node: NodeWorkflowNode
  } | null>(null)

  // Cancel any in-flight hover-preview rAF on unmount — its closure reads
  // refs only (no state write), but an orphaned callback still touching
  // `document` after the canvas route is gone is worth avoiding.
  useEffect(() => {
    return () => {
      if (dragRafIdRef.current !== null) {
        window.cancelAnimationFrame(dragRafIdRef.current)
      }
    }
  }, [])

  // S5f B4 把手热区: a boolean (toggled once per drag on start/stop, NOT
  // per-frame — the proximity check itself lives inside CastDock's own
  // listener, gated on this flag, so no re-render thrash). Only an ingest
  // source counts — plain repositioning of a video/shot node shouldn't pop
  // the dock open.
  const [canvasNodeDragActive, setCanvasNodeDragActive] = useState(false)

  // R3-2「本体归位」: the flow-space position a canvas-ingest-eligible node
  // had the moment its drag started, keyed by node id — `handleNodeDragStop`
  // reads this to bounce a non-folding source back where it came from once
  // its ingest succeeds. A ref, not state: written every drag start, read
  // once per drag stop, never rendered.
  const dragStartPositionsRef = useRef<Map<string, XYPosition>>(new Map())

  const handleNodeDragStart = useCallback(
    (_event: ReactMouseEvent, node: NodeWorkflowNode) => {
      setCanvasNodeDragActive(true)
      workflow.onNodesChange([{ id: node.id, type: 'select', selected: false }])

      if (
        !CANVAS_INGEST_DRAG_GESTURE_ENABLED ||
        !isCanvasIngestDragSource(node)
      ) {
        return
      }

      dragStartPositionsRef.current.set(node.id, {
        x: node.position.x,
        y: node.position.y,
      })
      dragRectCacheRef.current = buildCanvasDragRectCache(node.id)
    },
    [workflow],
  )

  // A1 perf: the actual per-frame hover-preview logic, unchanged from the
  // pre-fix `handleNodeDrag` body except for its hit-test source (cached
  // rects instead of a live `elementsFromPoint` DOM read) — every legality
  // check and bite-hover call below is identical to before.
  const processCanvasDragHoverPreview = useCallback(
    (node: NodeWorkflowNode, clientX: number, clientY: number) => {
      const hit = findCanvasDragHitFromCache(
        dragRectCacheRef.current,
        clientX,
        clientY,
      )
      const targetId = hit?.targetNodeId ?? null

      if (targetId === fuseBiteTargetIdRef.current) return

      if (fuseBiteTargetElRef.current) {
        clearBiteHover(fuseBiteTargetElRef.current)
        fuseBiteTargetElRef.current = null
      }
      fuseBiteTargetIdRef.current = targetId
      if (!targetId) return

      const targetNode = workflow.nodes.find(
        (candidate) => candidate.id === targetId,
      )
      if (!targetNode) return

      // The retired loose-image fusion special case is deliberately absent:
      // every legal drop preview is now derived from the connection matrix.
      const legal = evaluateCastIngest(
        node,
        targetNode,
        workflow.edges,
        workflow.nodes,
      ).legal
      if (!legal) return

      const el =
        findNodeCardElement(targetId) ??
        document.querySelector<HTMLElement>(
          `[data-cast-card-node-id="${targetId}"]`,
        )
      applyBiteHover(el, INGEST_MOTION.biteTiltDeg)
      fuseBiteTargetElRef.current = el
    },
    [workflow.nodes, workflow.edges],
  )

  const handleNodeDrag = useCallback(
    (event: ReactMouseEvent, node: NodeWorkflowNode) => {
      if (!CANVAS_INGEST_DRAG_GESTURE_ENABLED) return
      if (!isCanvasIngestDragSource(node)) return
      if (isLooseImageNode(node)) {
        const mediaUrl =
          typeof node.data.mediaUrl === 'string'
            ? node.data.mediaUrl.trim()
            : ''
        if (!mediaUrl) return
      }

      // A1 perf: coalesce to at most one hover-preview hit-test per
      // animation frame — native pointermove can fire far faster than the
      // 60fps a drag visually needs (high-poll-rate mice/trackpads), and the
      // old per-event `elementsFromPoint` call (S5d) forced a synchronous
      // layout on every single one of them. Only the pointer coordinates are
      // stashed synchronously here; the actual hit-test (cache-only, see
      // `processCanvasDragHoverPreview`) runs at most once per frame.
      pendingDragPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        node,
      }
      if (dragRafIdRef.current !== null) return
      dragRafIdRef.current = window.requestAnimationFrame(() => {
        dragRafIdRef.current = null
        const pending = pendingDragPointerRef.current
        if (!pending) return
        processCanvasDragHoverPreview(
          pending.node,
          pending.clientX,
          pending.clientY,
        )
      })
    },
    [processCanvasDragHoverPreview],
  )

  // Legacy canvas-node ingest hit-testing is retained behind the retired
  // gesture flag until its separate animation cleanup, but it can only create
  // graph edges now; the fused-node mutation has been removed.
  //
  // Reuses
  // ReactFlow's OWN native node-drag lifecycle (nodes are already draggable
  // for plain repositioning) instead of standing up a second custom
  // pointer/ghost engine for canvas-node-initiated ingest gestures. The
  // dragged NODE ITSELF is the visual "flight" for onscreen repositioning,
  // and hit-tests the drop point against currently-rendered canvas nodes / Cast
  // cards (`data-cast-card-node-id`) and plays the full three-beat (张口
  // already applied by `handleNodeDrag` above, 吸入 + 落定 here) on a legal
  // ingest, or the reject shake otherwise. Dropping on empty canvas or a
  // non-card element is a no-op — the node simply stays wherever the native
  // drag left it, a perfectly legal resting position (§三.1 散图 = 合法稳态,
  // and equally true of a zero-reference collector/voice/videoReference card
  // that was just dragged across open canvas).
  const handleNodeDragStop = useCallback(
    (event: ReactMouseEvent, node: NodeWorkflowNode) => {
      workflow.onNodesChange([{ id: node.id, type: 'select', selected: false }])
      // S5f B4: the drag is over — any auto-expanded dock re-collapses
      // (CastDock watches this flag falling).
      setCanvasNodeDragActive(false)
      // A1 perf: the drag is over — cancel any hover-preview rAF still in
      // flight and drop the rect cache/pending pointer so neither leaks into
      // the next drag or fires after this one has already resolved.
      if (dragRafIdRef.current !== null) {
        window.cancelAnimationFrame(dragRafIdRef.current)
        dragRafIdRef.current = null
      }
      pendingDragPointerRef.current = null
      dragRectCacheRef.current = []
      // Clear any 张口 bite-hover state `handleNodeDrag` left applied,
      // regardless of what happens below — a stale outline/scale must never
      // survive past the drop.
      if (fuseBiteTargetElRef.current) {
        clearBiteHover(fuseBiteTargetElRef.current)
        fuseBiteTargetElRef.current = null
      }
      fuseBiteTargetIdRef.current = null

      // ⛔ 吞噬**拖拽手势**退役（2026-07-28，owner 真机报「图片和视频直接无法
      // 连线，还是吞噬状态」）。
      //
      // 「吞噬正式退役」本就是已确认的结构条款，但 S3.5 只退役了**折叠**（连上
      // 之后源节点不再消失），这条**拖拽手势**一直还在：把一张卡拖到另一张卡上
      // 就走融合。后果是用户想连「图片 → 视频」根本连不了——手势在 dragStop
      // 这一层被劫持，走不到端口拖拽那条路（连线规则本身是允许 image→seedance
      // 的，见 node-connection-rules.ts）。
      //
      // 建边的唯一手势现在是**从端口拖到端口**。节点拖拽只负责移动位置——落在
      // 哪里都是合法稳态（§三.1 散图 = 合法稳态）。
      //
      // ⚠ 下面整段命中检测与三拍动画（张口/吸入/落定）**暂时保留不删**：
      // P0-C2「吞噬其余清理」是独立的一片，要连同 use-cast-ingest /
      // IngestDragLayer / NODE_STUDIO_INGEST_* / --ease-ingest 一起收。在那之前
      // 别把这个开关关掉，否则手势劫持立刻回来。
      //
      // ⚠ 用带显式 `: boolean` 标注的开关、而不是裸 `return`：裸 return 会让
      // 后面整段变成死代码，TS 的控制流分析随之失效，立刻报出 15 个「可能
      // undefined」——那些窄化本来是靠前面的守卫成立的。
      if (!CANVAS_INGEST_DRAG_GESTURE_ENABLED) return

      if (!isCanvasIngestDragSource(node)) return
      if (isLooseImageNode(node)) {
        const mediaUrl =
          typeof node.data.mediaUrl === 'string'
            ? node.data.mediaUrl.trim()
            : ''
        if (!mediaUrl) return
      }

      // S5d ⑤「融合目标改画布」: fix #2 makes zero-reference character/
      // background cards visible ON CANVAS, so dropping directly onto one is
      // now the primary path — `findCanvasDragHit` (elementsFromPoint,
      // plural — every element stacked at that point, topmost first, not
      // elementFromPoint) explicitly skips the dragged node's own raised-
      // z-index wrapper so it never shadows the target beneath it, and also
      // checks the Cast dock flyout's own card markup so dropping onto an
      // ALREADY-consumed (hence hidden) card via the still-open dock keeps
      // working — S5c's original path, not removed, just no longer the only
      // one.
      const hit = findCanvasDragHit(event, node.id)
      if (!hit) return
      const targetNode = workflow.nodes.find(
        (candidate) => candidate.id === hit.targetNodeId,
      )
      if (!targetNode) return

      // Capture the dragged card before the edge mutation; a successful
      // legacy ingest preview bounces the real node back to its origin.
      const sourceEl = findNodeCardElement(node.id)

      // General edge-based ingest — same legality
      // (canConnectNodeTypes + duplicate + capacity) and the same
      // onConnect path the Cast-dock pointer engine uses, just triggered by
      // a NATIVE canvas node drag instead of the dock's own ghost-drag.
      const evaluation = evaluateCastIngest(
        node,
        targetNode,
        workflow.edges,
        workflow.nodes,
      )
      if (evaluation.legal) {
        handleIngestConnect(node.id, targetNode.id)

        // 行①②③⑤ 全部走「墨线签署」——§2.7: the source node never folds,
        // so the old "fly into the target and
        // vanish" ghost was lying — the real card sat underneath the ghost
        // the whole time, unchanged, reading as "swallowed but still there".
        // The honest beats instead: target 轻咽 + edge draws in (via
        // `scheduleEdgeSigning` marking the pair, `renderedEdges`
        // force-showing it, `NodeWorkflowStatusEdge` playing the dash-in on
        // its own) + the dragged card's OWN element sliding back to where the
        // drag started. 散图（行⑤）2026-07-26 起并入这条路径：它建的是真边，
        // 边就该看得见，本体就该留下。
        toast.success(t('ingest.canvasNodeSigned'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        // reduced-motion: skip the forced-visible draw/hold window entirely
        // — §2.2's normal rules decide visibility from this frame on, no
        // "instant" edge that then lingers for `inkDrawMs + inkHoldFadeMs`
        // before the settle fade (whose own transition is already
        // near-zero) actually removes it. `playTargetSigningSettleAnimation`
        // / `playNodeBounceBack` below already self-skip via `canAnimate`.
        if (!prefersReducedMotion()) {
          scheduleEdgeSigning(node.id, targetNode.id)
        }
        playTargetSigningSettleAnimation(findNodeCardElement(targetNode.id))

        const dragStartPosition = dragStartPositionsRef.current.get(node.id)
        dragStartPositionsRef.current.delete(node.id)
        const commitBouncedPosition = () => {
          if (!dragStartPosition) return
          workflow.onNodesChange([
            {
              id: node.id,
              type: 'position',
              position: dragStartPosition,
              dragging: false,
            },
          ])
        }
        if (!dragStartPosition) return
        const wrapperEl = findNodeWrapperElement(node.id)
        if (!sourceEl || !wrapperEl) {
          commitBouncedPosition()
          return
        }
        const dropRect = wrapperEl.getBoundingClientRect()
        const originScreen = flowToScreenPosition(dragStartPosition)
        playNodeBounceBack(
          sourceEl,
          originScreen.x - dropRect.left,
          originScreen.y - dropRect.top,
          commitBouncedPosition,
        )
        return
      }

      playTargetRejectShakeAnimation(hit.cardElement)
      toast.error(t('ingest.canvasNodeIngestRejected'), {
        description: translateIngestReason(evaluation),
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [
      flowToScreenPosition,
      handleIngestConnect,
      scheduleEdgeSigning,
      t,
      translateIngestReason,
      workflow,
    ],
  )

  // S5c 三.2 本地文件拖入画布空白处: standard HTML5 DnD (this is a raw OS file
  // drag, not the S5b custom pointer engine — `ReactFlowProps` forwards
  // `onDrop`/`onDragOver` straight to the pane wrapper div). Upload reuses
  // `use-canvas-image-drop.ts` (same R2 primitive as the reference gallery);
  // each successful upload becomes its own role-less loose image node
  // (§三.1 稳态) at the drop point, staggered so multiple files never stack
  // exactly. A toast carries "上传中占位态" + "失败大声报错" (errors surface
  // per-file inside the hook already).
  const handleCanvasDragOver = useCallback((event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent) => {
      const files = Array.from(event.dataTransfer.files)
      if (files.length === 0) return
      event.preventDefault()

      const dropPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const loadingToastId = toast.loading(
        t('ingest.looseImage.uploading', { count: files.length }),
      )

      void canvasImageDrop.uploadFiles(files).then((uploaded) => {
        toast.dismiss(loadingToastId)
        if (uploaded.length === 0) return

        uploaded.forEach((result, index) => {
          const position = {
            x:
              dropPosition.x +
              index * NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.offsetX,
            y:
              dropPosition.y +
              index * NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.rowOffsetY,
          }
          const newNodeId = workflow.addNode(NODE_TYPE_IDS.image, position)
          // 台账 C5：拖入的文件名进显示名字段前剥扩展名。
          const droppedName = stripFileExtension(result.name)
          workflow.updateNodeData(newNodeId, {
            imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
            mediaKind: NODE_MEDIA_KIND_IDS.image,
            mediaUrl: result.url,
            mediaLabel: droppedName,
            sourceLabel: droppedName,
            generationStatus: NODE_GENERATION_STATUS_IDS.success,
            status: NODE_STATUS_IDS.done,
          })
        })

        toast.success(
          t('ingest.looseImage.uploaded', { count: uploaded.length }),
          {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          },
        )
      })
    },
    [canvasImageDrop, screenToFlowPosition, t, workflow],
  )

  // 画布级粘贴（canvas-image-card.md §4.1，owner 2026-07-27 拍板）：粘贴的图片
  // 立刻建节点、立刻进「上传中」态，不等传完才出现——不能照抄上面
  // handleCanvasDrop「先传完拿到 url 才 addNode」的写法（那条路径专为拖拽设计，
  // 节点落地即成功态）。这里改成「先建空节点，把 File 交给它自己的
  // ImageSourceStarter，用已有的单文件上传链路（真实进度/取消/失败重试，
  // use-node-reference-upload 已有）」——通过 pendingPasteFilesRef 做一次性
  // 交接（字段注释见 NodeWorkflowActionsContext）。落点换算复用
  // screenToFlowPosition + 同一份 referenceSpawn 错位间距，不另写一套。
  const pendingPasteFilesRef = useRef<Map<string, File>>(new Map())
  const consumePendingPasteFile = useCallback((nodeId: string) => {
    const file = pendingPasteFilesRef.current.get(nodeId)
    pendingPasteFilesRef.current.delete(nodeId)
    return file
  }, [])

  // 粘贴事件本身不带光标坐标（不是拖拽）——落点="鼠标当前位置"要另外跟踪；
  // 鼠标没进过画布/已经移出画布时 ref 为 null，回退视口中心（§4.1「落点」一
  // 行），复用引用拆出已经在用的 viewportCenter 写法。
  const lastCanvasPointerRef = useRef<{ x: number; y: number } | null>(null)
  const handleCanvasMouseMove = useCallback((event: ReactMouseEvent) => {
    lastCanvasPointerRef.current = { x: event.clientX, y: event.clientY }
  }, [])
  const handleCanvasMouseLeave = useCallback(() => {
    lastCanvasPointerRef.current = null
  }, [])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      // ⛔ 不抢输入焦点（§4.1 硬要求）：焦点在输入框/contenteditable，或在任意
      // Radix Popover/Dialog 内容里，或本文件自己跟踪的真·重层（详情面板/
      // 重编辑工作区/助手展开）打开时，画布完全不接管——那是那些界面自己的
      // 粘贴（MentionInput/CharacterImageReferenceControls/NodeMediaInspector
      // 三处既有行为不变，这里不碰它们）。
      //
      // The persistent node locator is not an overlay and does not block
      // canvas paste. Whether the add menu should block paste is a separate
      // product decision, so this path continues to only guard heavy overlays.
      const active = document.activeElement
      const isEditableFocus =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      const isInsideOverlay =
        active instanceof HTMLElement &&
        !!active.closest(
          '[data-slot="popover-content"], [data-slot="dialog-content"], [role="dialog"]',
        )
      if (isEditableFocus || isInsideOverlay || heavyOverlayOpen) {
        return
      }

      const files = Array.from(event.clipboardData?.files ?? []).filter(
        (entry) => entry.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      if (files.length === 0) return
      event.preventDefault()

      const pointer = lastCanvasPointerRef.current
      const dropPosition = pointer
        ? screenToFlowPosition(pointer)
        : screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })

      // §4.1「多图」：逐张建节点，沿落点错开排布，不合并成一个节点——同一份
      // referenceSpawn 错位间距，handleCanvasDrop 也在用。
      files.forEach((file, index) => {
        const position = {
          x:
            dropPosition.x +
            index * NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.offsetX,
          y:
            dropPosition.y +
            index * NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.rowOffsetY,
        }
        const newNodeId = workflow.addNode(NODE_TYPE_IDS.image, position)
        pendingPasteFilesRef.current.set(newNodeId, file)
      })
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [heavyOverlayOpen, screenToFlowPosition, workflow])

  const onWorkflowNodesChange = workflow.onNodesChange
  const resizeNode = useCallback(
    (nodeId: string, width: number, height: number) => {
      onWorkflowNodesChange([
        {
          id: nodeId,
          type: 'dimensions',
          dimensions: { width, height },
          setAttributes: true,
        },
      ])
    },
    [onWorkflowNodesChange],
  )

  const workflowActions = useMemo(
    () => ({
      updateNodeData: workflow.updateNodeData,
      resizeNode,
      updateEdgeData: workflow.updateEdgeData,
      placeDerivedImages: workflow.placeDerivedImages,
      setScriptDoc: workflow.setScriptDoc,
      setCanvasAppearance: workflow.setCanvasAppearance,
      setScriptDocStage: workflow.setScriptDocStage,
      setScriptDocDepth: workflow.setScriptDocDepth,
      setScriptDocLocks: workflow.setScriptDocLocks,
      setScriptDocShotStills: workflow.setScriptDocShotStills,
      applyScriptDocToGraph: workflow.applyScriptDocToGraph,
      previewScriptDocProjection: workflow.previewScriptDocProjection,
      deleteNode: workflow.deleteNode,
      // R3-2 §2.7: routed through the reverse-ink-retreat wrapper — every
      // consumer of the shared context action (成分栏 chip ×, ShotInspector
      // 取出, etc.) gets the same 解绑反放 treatment as the cut-tool click,
      // since they're all semantically "unbind this edge" (§2.8's three
      // equivalent removal paths).
      deleteEdge: handleDeleteEdgeWithSignOff,
      undo: workflow.undo,
      redo: workflow.redo,
      canUndo: workflow.canUndo,
      canRedo: workflow.canRedo,
      generateCharacterImage: handleGenerateCharacterImage,
      // ⚠ context 的签名只有 `(nodeId)`，第二个来源参数**够不着** —— 这是有意
      // 的：走 context 的全是用户操作（卡上的生成/重试、Inspector、编辑框），
      // 一律落 `user`。助手不走 context，它在本文件里直接调并显式传 assistant。
      // 别为了「让某个组件也能传来源」把 context 签名加宽（包 6 ①-bis）。
      generateMediaNode: handleGenerateMediaNode,
      enhanceSeedancePrompt: handleEnhanceSeedancePrompt,
      focusGeneratedNodes: handleFocusGeneratedNodes,
      focusNode: handleFocusNode,
      listConnectableReferences,
      connectReferenceNode,
      spawnReference: handleSpawnReference,
      extractReference: handleExtractReference,
      runGenerateComposer: handleRunGenerateComposer,
      runAssistantCanvasOps: handleRunAssistantCanvasOps,
      reviewMode,
      regenerateForReview: handleRegenerateForReview,
      quickEditNodeId,
      setQuickEditNodeId,
      toolMode,
      setToolMode,
      expandedNodeId,
      setExpandedNodeId,
      heavyOverlayOpen,
      setImageEditWorkspaceOpen,
      transientLayerOpen,
      multiSelectActive,
      canvasNodeDragActive,
      modelOptionsByType,
      scriptDocStage: workflow.scriptDocStage,
      scriptDocDepth: workflow.scriptDocDepth,
      scriptDocLocks: workflow.scriptDocLocks,
      scriptDocShotStills: workflow.scriptDocShotStills,
      // R3-8 C1 场记条: reuse the same project name CanvasTopBar already
      // renders — no new data source, just threaded one level deeper.
      projectName: workflow.currentProjectName,
      consumePendingPasteFile,
    }),
    [
      expandedNodeId,
      heavyOverlayOpen,
      setImageEditWorkspaceOpen,
      transientLayerOpen,
      multiSelectActive,
      canvasNodeDragActive,
      consumePendingPasteFile,
      handleDeleteEdgeWithSignOff,
      handleEnhanceSeedancePrompt,
      handleFocusGeneratedNodes,
      handleFocusNode,
      listConnectableReferences,
      connectReferenceNode,
      handleSpawnReference,
      handleExtractReference,
      handleGenerateCharacterImage,
      handleGenerateMediaNode,
      handleRunAssistantCanvasOps,
      handleRunGenerateComposer,
      handleRegenerateForReview,
      reviewMode,
      resizeNode,
      quickEditNodeId,
      modelOptionsByType,
      setToolMode,
      toolMode,
      workflow.canRedo,
      workflow.canUndo,
      workflow.deleteNode,
      workflow.placeDerivedImages,
      workflow.redo,
      workflow.setScriptDoc,
      workflow.setCanvasAppearance,
      workflow.setScriptDocStage,
      workflow.setScriptDocDepth,
      workflow.setScriptDocLocks,
      workflow.setScriptDocShotStills,
      workflow.scriptDocStage,
      workflow.scriptDocDepth,
      workflow.scriptDocLocks,
      workflow.scriptDocShotStills,
      workflow.applyScriptDocToGraph,
      workflow.previewScriptDocProjection,
      workflow.undo,
      workflow.updateEdgeData,
      workflow.updateNodeData,
      workflow.currentProjectName,
    ],
  )

  // S2b 宽度策略（规格 §8）：左 296 + 右助手约 420 = 716px 被 chrome 吃掉，
  // 1440 宽的屏只剩 724px 画布。所以两侧不能同时满开：
  //   ≥1600        左面板常驻展开 + 右 dock 可同时开
  //   1024–1600    打开助手时左面板自动收成 56px 图标轨
  //   768–1024     左面板默认收成图标轨
  //   <768         整个左面板不渲染（md: 以下不假装完整画布，既有约定）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const narrow = window.matchMedia('(max-width: 1023.98px)')
    const mid = window.matchMedia('(max-width: 1599.98px)')
    const apply = () => {
      if (narrow.matches) {
        setLeftPanelExpanded(false)
        return
      }
      if (mid.matches && assistantDockOpen) {
        setLeftPanelExpanded(false)
      }
    }
    apply()
    narrow.addEventListener('change', apply)
    mid.addEventListener('change', apply)
    return () => {
      narrow.removeEventListener('change', apply)
      mid.removeEventListener('change', apply)
    }
  }, [assistantDockOpen])

  const nodeLocatorCount = useMemo(
    () => countCanvasNodes(workflow.nodes),
    [workflow.nodes],
  )

  const assistantMode = !assistantDockOpen
    ? 'closed'
    : assistantExpanded
      ? 'script'
      : 'chat'

  const canvasStageStyle = useMemo(
    () => getCanvasAppearanceCssVars(workflow.canvasAppearance),
    [workflow.canvasAppearance],
  )

  return (
    <NodeWorkflowActionsProvider value={workflowActions}>
      <CanvasWorkspaceLayout
        assistantMode={assistantMode}
        stageRef={canvasRef}
        stageStyle={canvasStageStyle}
        reviewMode={reviewMode.active}
        assistant={
          <StudioNodeAssistantDock
            open={assistantDockOpen}
            expanded={assistantExpanded}
            projectId={workflow.currentProjectId}
            projectName={workflow.currentProjectName}
            nodes={workflow.nodes}
            edges={workflow.edges}
            scriptDoc={workflow.scriptDoc}
            locale={appLocale}
            onOpenChange={setAssistantDockOpen}
            onExpandedChange={setAssistantExpanded}
            onFocusNode={handleFocusNode}
          />
        }
      >
        <IngestDragProvider
          nodes={workflow.nodes}
          edges={workflow.edges}
          onConnect={handleIngestConnect}
          quickThrowApiRef={quickThrowApiRef}
        >
          <CanvasSurface appearance={workflow.canvasAppearance} />
          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            nodeTypes={NODE_COMPONENTS}
            edgeTypes={NODE_EDGE_COMPONENTS}
            onNodesChange={workflow.onNodesChange}
            onEdgesChange={workflow.onEdgesChange}
            onConnect={workflow.onConnect}
            isValidConnection={isValidConnection}
            onEdgeClick={handleEdgeClick}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={handlePaneContextMenu}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onDrop={handleCanvasDrop}
            onDragOver={handleCanvasDragOver}
            // 画布级粘贴（§4.1）落点="鼠标当前位置"要靠这两个跟踪——粘贴事件本身
            // 不带坐标，见上面 handlePaste 附近的注释。
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultViewport={NODE_STUDIO_CANVAS.defaultViewport}
            // A3: explicit bounds instead of the library's implicit 0.5/2
            // defaults — see NODE_STUDIO_CANVAS doc comment.
            minZoom={NODE_STUDIO_CANVAS.minZoom}
            maxZoom={NODE_STUDIO_CANVAS.maxZoom}
            defaultEdgeOptions={NODE_STUDIO_DEFAULT_EDGE_OPTIONS}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={NODE_STUDIO_CONNECTION_LINE_STYLE}
            proOptions={NODE_STUDIO_REACT_FLOW_PRO_OPTIONS}
            nodesDraggable
            // ⚠ 2026-07-28 反转「§2.4 端口锚点化退场」：原文说「binding only
            // happens via 吞噬/快投 now」，于是把端口连线在 workbench 层和
            // Handle 层双双关死。吞噬拖拽手势退役之后这条就翻过来了——**端口
            // 拖拽是现在唯一的建边手势**，三层（这里 / Handle 的
            // isConnectable / HANDLE_BASE 的 pointer-events）必须一起打开，
            // 少一层就是「看得见端口但拉不出线」。
            nodesConnectable
            elementsSelectable
            selectNodesOnDrag={false}
            nodeDragThreshold={NODE_STUDIO_CANVAS.nodeDragThreshold}
            panOnDrag={panOnDrag}
            panActivationKeyCode={NODE_STUDIO_CANVAS.panActivationKeyCode}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            zoomOnScroll
            // Detail opens only from an explicit expand button. Keep native
            // double-click zoom disabled so the gesture is inert on nodes.
            zoomOnDoubleClick={false}
            fitView={false}
            className="h-full w-full !bg-transparent"
            style={{ backgroundColor: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={NODE_STUDIO_CANVAS.background.gap}
              size={NODE_STUDIO_CANVAS.background.size}
              color="var(--canvas-grid-dot)"
            />
            {/* S2b：minimap 挪到 chrome 层（见下方带 --canvas-minimap-left 的
                包装），这样它的左偏移能跟着左侧面板的展开态走。 */}
            <VideoMergeComposeToolbar
              nodeIds={composeSelectionNodeIds}
              onCompose={handleComposeVideoMerge}
            />
            {/* canvas-generate-composer.md：画布级共享组件，挂载一次——同
                VideoMergeComposeToolbar 的手法，自己内部用 NodeToolbar(nodeId)
                贴宿主卡下方，或在无宿主（画布空白双击）时浮在固定屏幕坐标。 */}
            <GenerateComposer />
          </ReactFlow>
          {workflow.nodes.length === 0 && (
            // R3-4 §4.1: 空态引导画在画布内容之上、工作区 chrome 之下（两者
            // 用 inset 互相避让，不实际重叠，这里的相对次序只是兜底）。
            <div className="pointer-events-none absolute inset-x-4 bottom-24 top-20 z-canvas-selection flex items-center justify-center md:inset-x-8 md:bottom-16 md:top-24">
              <NodeCanvasEmptyGuide
                onChatOutline={() => {
                  setAssistantDockOpen(true)
                  setAssistantExpanded(true)
                }}
                onAddNode={handleTopbarAddClick}
              />
            </div>
          )}
          {/* R3-4 §4.1 L4: 工作区 chrome（顶栏 + 底部工具条行）；子级的
              CanvasAddMenu(L5)/NodeDetailPanel(L6) 在这个局部栈内用更高的
              token 盖过顶栏/底部工具条，互不外泄到这个 div 的数值本身。 */}
          <div className="pointer-events-none absolute inset-0 z-canvas-chrome">
            <CanvasTopBar
              nodeCount={workflow.nodes.length}
              projectName={workflow.currentProjectName}
              canvasAppearance={workflow.canvasAppearance}
              onCanvasAppearanceChange={workflow.setCanvasAppearance}
              isSaving={isSaving}
              reviewPendingCount={reviewMode.remaining}
              onStartReview={reviewMode.enter}
            />
            {/* 包 6 片 2：模式条。只在模式里渲染（组件自己判），是本模式唯一新增
                的表面 —— 审核动作仍在编辑框参数条首位（owner 拍板的落点）。 */}
            <ReviewModeBar />
            {/* Bottom chrome: tools + 卡匣 handle share one centered row. */}
            <div
              // canvas-bottom-row：给 right 加过渡。它与顶栏 padding、左轨宽度
              // 由同一个 --canvas-assistant-width 驱动，此前只有那两层会动，
              // 这一层是硬跳的（台账 §13.2 布局连续）。
              className="canvas-bottom-row pointer-events-none absolute bottom-3 z-canvas-chrome flex items-end justify-center gap-2"
              style={{
                left: bottomRowInsetPx.left,
                right: bottomRowInsetPx.right,
              }}
            >
              <CanvasBottomDock
                activeMode={toolMode}
                canUndo={workflow.canUndo}
                canRedo={workflow.canRedo}
                onModeChange={setToolMode}
                onUndo={workflow.undo}
                onRedo={workflow.redo}
                relationsCollapsed={relationsCollapsed}
                onRelationsCollapsedChange={setRelationsCollapsed}
                onArrange={handleTidyLayout}
                nodeCount={workflow.nodes.length}
              />
            </div>
            {/* S2b（2026-07-26）：卡匣从底部横匣搬进左侧合体面板。底部那行现在
                只剩视图控制（选择·手/缩放/适应/撤销重做），符合规格 §12.2
                「左 = 内容动作，底 = 视图控制」的职责分栏。 */}
            {/* minimap 让开左侧面板：把它的左偏移做成变量挂在 chrome 层，
                面板展开/收起时同一条 --canvas-dur-slow 一起动，不会错位。 */}
            <div
              className="pointer-events-none absolute inset-0"
              style={
                {
                  '--canvas-minimap-left': leftPanelExpanded
                    ? 'calc(var(--canvas-panel-w) + var(--canvas-rail-w) + 2rem)'
                    : 'calc(var(--canvas-rail-w) + 2rem)',
                } as CSSProperties
              }
            >
              <CanvasMiniMap />
            </div>
            <CanvasLeftPanel
              expanded={leftPanelExpanded}
              onExpandedChange={setLeftPanelExpanded}
              view={leftPanelView}
              onViewChange={setLeftPanelView}
              nodeCount={nodeLocatorCount}
              onAddClick={handleTopbarAddClick}
              projectPanel={
                <CanvasProjectPanel
                  projectName={workflow.currentProjectName}
                  projects={workflow.projects}
                  currentProjectId={workflow.currentProjectId}
                  nodeCount={workflow.nodes.length}
                  isSaving={isSaving}
                  onSave={handleSaveNow}
                  onCreateProject={handleCreateProject}
                  onRenameProject={handleRenameProject}
                  onDeleteProject={handleDeleteProject}
                  onSwitchProject={handleSwitchProject}
                />
              }
            >
              <CastDock />
            </CanvasLeftPanel>
            <CanvasAddMenu
              open={Boolean(addMenu)}
              screenPosition={addMenu?.menuPosition ?? null}
              onSelect={handleAddNode}
              onUpload={handleAddMenuUpload}
              onClose={closeAddMenu}
            />
            {/* 台账 #26：添加菜单「上传图片」主行的隐藏 file input——菜单
                关掉后仍要在场接住系统对话框的 change，所以挂宿主不挂菜单。 */}
            <input
              ref={addUploadInputRef}
              type="file"
              accept={NODE_STUDIO_IMAGE_INPUT.accept}
              multiple
              className="hidden"
              onChange={handleAddUploadChange}
            />
            <NodeDetailPanel
              expandedNodeId={expandedNodeId}
              onClose={() => setExpandedNodeId(null)}
            />
          </div>
          <ProjectNameDialog
            open={projectDialogMode !== null}
            title={
              projectDialogMode === 'rename'
                ? t('projectDialog.renameTitle')
                : t('projectDialog.createTitle')
            }
            placeholder={t('topbar.createProjectPrompt')}
            submitLabel={
              projectDialogMode === 'rename'
                ? t('projectDialog.renameSubmit')
                : t('projectDialog.createSubmit')
            }
            cancelLabel={t('projectDialog.cancel')}
            defaultValue={
              projectDialogMode === 'rename'
                ? workflow.currentProjectName
                : t('projectNewDefaultName', {
                    n: workflow.projects.length + 1,
                  })
            }
            onOpenChange={(open) => {
              if (!open) {
                setProjectDialogMode(null)
              }
            }}
            onSubmit={handleProjectNameSubmit}
          />
          <AlertDialog
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('projectDialog.deleteTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('topbar.deleteProjectConfirm', {
                    name: workflow.currentProjectName,
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t('projectDialog.cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleConfirmDeleteProject}
                >
                  {t('projectDialog.deleteConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </IngestDragProvider>
      </CanvasWorkspaceLayout>
    </NodeWorkflowActionsProvider>
  )
}
