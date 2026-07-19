'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  CANVAS_ADD_INTENT_IDS,
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
  NODE_GENERATION_STATUS_IDS,
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
} from '@/constants/node-types'
import { DEFAULT_ASPECT_RATIO } from '@/constants/config'
import { INGEST_MOTION, NODE_EDGE_SIGNING_MOTION } from '@/constants/motion'
import { DEFAULT_SCRIPT_PLANNER_PROVIDER } from '@/constants/script-breakdown'
import { AUDIO_EMOTIONS, type AudioEmotion } from '@/constants/voice-cards'
import {
  getCapabilityConfig,
  getMaxReferenceImages,
  hasCapability,
} from '@/constants/provider-capabilities'
import { useCharacterImageGeneration } from '@/hooks/cards/use-character-image-generation'
import { useSeedancePromptPlan } from '@/hooks/prompts/use-seedance-prompt-plan'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import { useNodeGenerationReconcile } from '@/hooks/node/use-node-generation-reconcile'
import { useNodeMediaGeneration } from '@/hooks/node/use-node-media-generation'
import {
  applyBiteHover,
  clearBiteHover,
  evaluateCastIngest,
  findNodeCardElement,
  findNodeWrapperElement,
  playCanvasFuseSwallowAnimation,
  playNodeBounceBack,
  playTargetGulpAnimation,
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
import { useWorkflowModelOptions } from '@/hooks/use-workflow-model-options'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'
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
import { assembleReferenceImagePayload } from '@/lib/node-reference-payload'
import type { AdvancedParams } from '@/types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import {
  clearStudioNodeResult,
  readStudioNodeResult,
} from '@/lib/studio-node-handoff'
import { resolveEffectiveVideoModelOption } from '@/lib/video-model-resolver'
import { canConnectNodeTypes } from '@/lib/node-connection-rules'
import {
  edgePairKey,
  NODE_EDGE_TIER_IDS,
  resolveNodeEdgeTier,
  resolveNodeEdgeVisibility,
} from '@/lib/node-edge-tier'
import { isNodeWorkflowGenerating } from '@/lib/node-workflow-edge-visual'
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
import { CanvasSurface, getCanvasAppearanceCssVars } from './CanvasSurface'
import { CanvasTopBar } from './CanvasTopBar'
import { CanvasWorkspaceLayout } from './CanvasWorkspaceLayout'
import { CastDock, type CastSectionId } from './CastDock'
import { createReferenceAsset } from './CharacterImageReferenceControls'
import { IngestDragProvider, type QuickThrowApi } from './IngestDragLayer'
import { NodeCanvasEmptyGuide } from './NodeCanvasEmptyGuide'
import {
  NodeWorkflowActionsProvider,
  type SpawnReferenceInput,
} from './NodeWorkflowActionsContext'
import { ProjectNameDialog } from './ProjectNameDialog'
import { StudioNodeAssistantDock } from './StudioNodeAssistantDock'
import { VideoMergeComposeToolbar } from './VideoMergeComposeToolbar'
import { NodeDetailPanel } from './node-detail/NodeDetailPanel'
import { AgentNode } from './nodes/AgentNode'
import { BackgroundImageNode } from './nodes/BackgroundImageNode'
import { CharacterImageNode } from './nodes/CharacterImageNode'
import { ComposerNode } from './nodes/ComposerNode'
import { FrameImageNode } from './nodes/FrameImageNode'
import { ImageNode } from './nodes/ImageNode'
import { SeedanceNode } from './nodes/SeedanceNode'
import { ShotNode } from './nodes/ShotNode'
import { ShotTextNode } from './nodes/ShotTextNode'
import { VideoMergeNode } from './nodes/VideoMergeNode'
import { VideoReferenceNode } from './nodes/VideoReferenceNode'
import { VoiceNode } from './nodes/VoiceNode'
import { NodeWorkflowStatusEdge } from './edges/NodeWorkflowStatusEdge'

const NODE_COMPONENTS: NodeTypes = {
  [NODE_TYPE_IDS.composer]: ComposerNode,
  [NODE_TYPE_IDS.agent]: AgentNode,
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

/**
 * S5d ⑤/【紧急修复】: pure legality check shared by the 张口 bite-hover
 * preview (during native drag, `handleNodeDrag`) and the actual fuse mutation
 * (`handleFuseLooseImageNode`) — one source of truth so the bite preview
 * never promises a fuse the drop then rejects. Mirrors
 * `handleFuseLooseImageNode`'s own checks minus the mutation.
 */
function isLegalLooseImageFuseTarget(
  sourceNode: NodeWorkflowNode,
  targetNode: NodeWorkflowNode,
): boolean {
  if (sourceNode.id === targetNode.id) return false
  if (!isCollectorCardNode(targetNode)) return false

  const mediaUrl =
    typeof sourceNode.data.mediaUrl === 'string'
      ? sourceNode.data.mediaUrl.trim()
      : ''
  if (!mediaUrl) return false

  const existing = targetNode.data.referenceAssets ?? []
  const alreadyFused = existing.some(
    (reference) =>
      reference.source === NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas &&
      reference.sourceId === sourceNode.id,
  )
  if (alreadyFused) return false

  const maxItems = targetNode.data.model
    ? getMaxReferenceImages(
        targetNode.data.model.adapterType,
        targetNode.data.model.modelId,
      )
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems
  return existing.length < maxItems
}

export function StudioNodeWorkbench() {
  return (
    <section
      // The canvas is a dark surface, but `.dark` only remaps color tokens — it
      // doesn't set `color-scheme`, so native UI (scrollbars, form controls)
      // inside it fell back to the OS light scheme and painted a white scrollbar
      // down dark scroll areas like the node detail panel. Scope the dark scheme
      // here (not globally — `<html>` is `dark` while most pages render light)
      // so every in-canvas scroll area gets a matching dark scrollbar.
      style={{ colorScheme: 'dark' }}
      className="dark relative h-[calc(100svh-3rem)] min-h-[36rem] overflow-hidden bg-node-canvas text-node-foreground lg:h-svh"
    >
      <ReactFlowProvider>
        <Suspense fallback={null}>
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
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null)
  const [assistantDockOpen, setAssistantDockOpen] = useState(true)
  // E1b three states: collapsed (!open) / dock (open) / expanded (open+expanded).
  const [assistantExpanded, setAssistantExpanded] = useState(false)
  // The node whose ⤢ detail panel is open (B3 shared floating panel). One id
  // because a single shared panel renders the one expanded node.
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  // R3-4 (canvas-relationship-v3 §4.2): a one-way mirror of CastDock's own
  // collapsed/expanded state (owner stays CastDock — the drag-hover
  // auto-expand/re-collapse choreography lives there) and of
  // CanvasImageEditWorkspace's `activeTask` (owner stays
  // CanvasImageSelectionToolbar). Both exist purely so the workbench can
  // enforce the L5 mutual-exclusion + 档2/档3→L5/L3 close cascade + Esc
  // ladder without lifting either component's real state.
  const [castDockExpanded, setCastDockExpanded] = useState(false)
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

  // R3-4 (canvas-relationship-v3 §4.2 rule 3): true while 档2（详情面板）or
  // 档3（重编辑工作区 / 剧本笺展开）is open. Broadcast to node-local L3 chrome
  // via context (`heavyOverlayOpen`) and used below to force-close L5.
  const heavyOverlayOpen =
    Boolean(expandedNodeId) ||
    imageEditWorkspaceOpen ||
    (assistantDockOpen && assistantExpanded)

  useEffect(() => {
    if (!heavyOverlayOpen) return
    setAddMenu(null)
    setCastDockExpanded(false)
  }, [heavyOverlayOpen])

  // R3-4 §4.2 rule 1: the two L5 citizens are mutually exclusive. This is the
  // "cast dock opens → add menu closes" direction, written explicitly rather
  // than relying on CanvasAddMenu's own outside-pointerdown close (which
  // already happens to cover it as a side effect). The reverse direction
  // (add menu opens → cast dock collapses) is `castDockForceCollapse` below,
  // fed into `<CastDock forceCollapse>`.
  useEffect(() => {
    if (castDockExpanded) closeAddMenu()
  }, [castDockExpanded, closeAddMenu])

  const castDockForceCollapse = Boolean(addMenu) || heavyOverlayOpen

  // R3-4 §4.2 rule 1 (extended): broadcast "an L5 citizen is open" so
  // node-local L3 chrome (loose image quick-edit panel) can tuck itself away
  // too — same one-way-mirror pattern as `heavyOverlayOpen`, just for the
  // lighter tier. See the context field's own doc comment for why this is
  // separate from `heavyOverlayOpen` rather than folded into it.
  const transientLayerOpen = Boolean(addMenu) || castDockExpanded

  useOverlayFocusReturn(Boolean(addMenu))
  useOverlayFocusReturn(Boolean(expandedNodeId))
  useOverlayFocusReturn(castDockExpanded)
  // R3-4 §4.2 rule 3 (焦点还原覆盖 L5/L6/L7): 档3-script（剧本笺展开）不是
  // Radix Dialog，没有 Radix 自带的关闭时焦点回归，需要这里手动补一份——
  // 档3-image（CanvasImageEditWorkspace）走 Radix ResponsiveDialog，那份由
  // Radix 自己处理，不重复注册。
  useOverlayFocusReturn(assistantDockOpen && assistantExpanded)

  // R3-4 §4.2 Esc 链（档3→档2→L5→取消选中，一次一层）。NodeDetailPanel(档2)
  // 和 CanvasImageEditWorkspace(档3-image，Radix Dialog) 已经各自听自己的
  // Escape——两者都用整屏 backdrop 挡住下层交互，永远不会跟这里的分支同时
  // 是"当前最高层"，所以 expandedNodeId / imageEditWorkspaceOpen 存在时这里
  // 完全不动，把这次按键让给各自的监听器（NodeDetailPanel 自己的 window
  // 监听 / Radix Dialog 内建的 onEscapeKeyDown）——否则同一次按键会被这里的
  // window 监听器"顺手"再吞一层（连带取消选中），一次按键退两层，破坏"一次
  // 一层"。这里接手没有 backdrop 的 档3-script（剧本笺展开）+ L5（添加菜单 /
  // 卡匣展开浮层）+ 取消选中。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (expandedNodeId || imageEditWorkspaceOpen) return

      if (assistantDockOpen && assistantExpanded) {
        setAssistantExpanded(false)
        return
      }
      if (addMenu || castDockExpanded) {
        setAddMenu(null)
        setCastDockExpanded(false)
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
    castDockExpanded,
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

  // R3-3 (canvas-relationship-v3 §3.1/§7): double-click opens the same ⤢
  // detail panel as the toolbar's expand button — one path, two triggers.
  // Paired with `zoomOnDoubleClick={false}` on <ReactFlow> below so the
  // gesture isn't still bound to the library's default zoom-in.
  const handleNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: NodeWorkflowNode) => {
      setExpandedNodeId(node.id)
    },
    [],
  )

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
      const supportsLora = hasCapability(
        model.adapterType,
        'lora',
        model.modelId,
      )
      const maxLoras =
        getCapabilityConfig(model.adapterType, model.modelId).maxLoras ??
        Number.POSITIVE_INFINITY
      const loras = supportsLora
        ? (node.data.loras ?? []).slice(0, maxLoras).map((lora) => ({
            url: lora.loraUrl,
            scale: lora.scale,
          }))
        : []
      const advancedParams: AdvancedParams | undefined =
        loras.length > 0 ? { loras } : undefined

      const result = await characterImageGeneration.generate(
        {
          modelId: model.modelId,
          apiKeyId: model.apiKeyId,
          freePrompt: prompt,
          aspectRatio: DEFAULT_ASPECT_RATIO,
          referenceImages:
            referenceImages.length > 0 ? referenceImages : undefined,
          advancedParams,
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

  const handleGenerateMediaNode = useCallback(
    async (nodeId: string) => {
      const node = workflow.nodes.find((item) => item.id === nodeId)
      const kind = node ? NODE_MEDIA_KIND_BY_NODE_TYPE[node.type] : undefined
      const ownPrompt = node
        ? buildNodeWorkflowPrompt(node.type, node.data)
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
      const upstreamImageUrls = isVideoMediaNode
        ? [
            // R3-6b §3 每镜覆写: pass edges + nodeId so a collector's
            // contribution honors this specific collector→video edge's
            // stageOverrideUrls instead of always falling back to the card's
            // own onStage curation.
            ...harvestUpstreamImageUrls(upstreamNodes, workflow.edges, nodeId),
            ...harvestUpstreamCloseupUrls(
              nodeId,
              workflow.edges,
              workflow.nodes,
            ),
          ]
        : []
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
      const upstreamImageReferences = isShotImageNode
        ? harvestUpstreamImageReferences(upstreamNodes)
        : []

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
      const referenceImages = assembleReferenceImagePayload(
        [
          existingImageReference,
          ...(node.data.referenceAssets ?? []).map((asset) => asset.url),
          ...upstreamImageUrls,
          ...upstreamImageReferences.map((reference) => reference.url),
        ],
        maxReferenceImages,
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
      // V-3b 只送已引用（docs/plans/node-video-reference-seedance-design.md §3
      // 决策1）: narrow the sent image_urls down to only what `mergedPrompt`
      // actually `@`-mentions. 迁移红线 lives inside `filterReferencedImages`
      // itself — a project with connections but no matching @-mention keeps
      // sending everything (pre-V-3 behaviour), so upgrading never silently
      // drops a reference. `effectiveReferenceImages` is what ACTUALLY ships;
      // `referenceImages` above stays the raw connected set (still used as-is
      // by the shot-image branch, which V-3b does not touch — §3 决策8 维持现状).
      const referencedFilter = isVideoMediaNode
        ? filterReferencedImages(
            mergedPrompt,
            referenceImages,
            videoImageRefByUrl,
            videoImageAutoNamePrefix,
          )
        : null
      const effectiveReferenceImages = referencedFilter
        ? referencedFilter.referenceImages
        : referenceImages
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
      // V-1 发送翻译层（docs/plans/node-video-v1-token-translation.md）: Seedance
      // only resolves the POSITIONAL @Image1/@Image2… token (verified against
      // fal's reference-to-video contract), never a custom name — so the
      // @弗洛洛 mention MentionInput serialized into `mergedPrompt` has to be
      // rewritten to @ImageN right before it leaves the client. The node's
      // stored prompt / what the composer renders is untouched; only this
      // outbound copy (`seedanceReadyPrompt`) changes. No-op for non-video
      // media kinds (empty map → returned verbatim). `imageIndexByName` now
      // comes from the V-3b filter above — it's already reindexed against
      // `effectiveReferenceImages`, so @ImageN in the translated prompt lines
      // up with the ACTUAL sent position, not the pre-filter one.
      const imageIndexByName = referencedFilter
        ? referencedFilter.imageIndexByName
        : new Map<string, number>()
      const seedanceReadyPrompt = translatePromptTokensToPositional(
        mergedPrompt,
        imageIndexByName,
      )
      const finalPrompt = referenceLegend
        ? `${referenceLegend}\n\n${seedanceReadyPrompt}`
        : seedanceReadyPrompt
      const supportsLora =
        isImageMediaNode &&
        hasCapability(model.adapterType, 'lora', model.modelId)
      const maxLoras =
        getCapabilityConfig(model.adapterType, model.modelId).maxLoras ??
        Number.POSITIVE_INFINITY
      const loras = supportsLora
        ? (node.data.loras ?? []).slice(0, maxLoras).map((lora) => ({
            url: lora.loraUrl,
            scale: lora.scale,
          }))
        : []
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
      // Video negativePrompt now rides a flat field (the hook forwards it to
      // submitVideoAPI); advancedParams stays image-only (loras).
      const advancedParams: AdvancedParams | undefined =
        loras.length > 0 ? { loras } : undefined

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

      // Reference-ness is mode-by-input: resolve it HERE from the actual
      // harvested inputs, not from the persisted (possibly stale) data.model. A
      // video node defaulted to a non-reference Seedance id keeps that id even
      // after reference edges (character image / reference video / voice) are
      // wired — `useVideoComposer` resolves the model only once — and the worker
      // then routes it to `buildSeedance20`, which silently drops video_urls /
      // audio_urls. Re-resolving at submit keeps the reference clip alive.
      const videoHasReferenceInputs =
        effectiveReferenceImages.length > 0 ||
        upstreamVideoUrls.length > 0 ||
        upstreamAudioUrls.length > 0
      const effectiveVideoModel = isVideoMediaNode
        ? resolveEffectiveVideoModelOption(
            model,
            videoHasReferenceInputs,
            modelOptionsByType[NODE_TYPE_IDS.seedance] ?? [],
          )
        : null
      const submitModelId = effectiveVideoModel?.modelId ?? model.modelId
      const submitApiKeyId = effectiveVideoModel?.apiKeyId ?? model.apiKeyId

      const result = await nodeMediaGeneration.generate(
        {
          kind,
          modelId: submitModelId,
          apiKeyId: submitApiKeyId,
          prompt: finalPrompt,
          duration: videoDuration,
          resolution: videoResolution,
          aspectRatio: videoAspectRatio,
          referenceImages:
            effectiveReferenceImages.length > 0
              ? effectiveReferenceImages
              : undefined,
          audioUrls:
            upstreamAudioUrls.length > 0 ? upstreamAudioUrls : undefined,
          audioBindings:
            upstreamAudioBindings.length > 0
              ? upstreamAudioBindings
              : undefined,
          videoUrls:
            upstreamVideoUrls.length > 0 ? upstreamVideoUrls : undefined,
          voiceId: audioVoiceId,
          speed: audioSpeed,
          volume: audioVolume,
          emotion: audioEmotion,
          negativePrompt,
          generateAudio: videoGenerateAudio,
          seed: videoSeed,
          advancedParams,
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
          mediaKind: kind,
          mediaUrl: result.mediaUrl,
          ...(isVideoMediaNode
            ? {
                videoThumbnailUrl: result.thumbnailUrl,
                lineage: {
                  operation: 'generate' as const,
                  sourceUrls: [
                    ...effectiveReferenceImages,
                    ...upstreamVideoUrls,
                    ...upstreamAudioUrls,
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
          mediaLabel: result.generation.model,
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
      setExpandedNodeId(sessionDecision.nodeId)
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
      setExpandedNodeId(resolution.nodeId)
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
    // The next render sees the newly created node, then performs selection,
    // fitView, and panel expansion through the same remembered-node path.
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
  const handleCastCreate = useCallback(
    (sectionId: CastSectionId) => {
      const anchor = NODE_STUDIO_NODE_PLACEMENT.topbarAddPosition
      const position = {
        x: anchor.x,
        y:
          anchor.y +
          (workflow.nodes.length % 6) *
            NODE_STUDIO_NODE_PLACEMENT.referenceSpawn.rowOffsetY,
      }

      const intentId =
        sectionId === NODE_IMAGE_ROLE_IDS.character
          ? CANVAS_ADD_INTENT_IDS.organizeCharacter
          : sectionId === NODE_IMAGE_ROLE_IDS.background
            ? CANVAS_ADD_INTENT_IDS.organizeScene
            : sectionId === NODE_TYPE_IDS.voice
              ? CANVAS_ADD_INTENT_IDS.audioVoiceProfile
              : CANVAS_ADD_INTENT_IDS.videoReference
      const newId = createCanvasObject(intentId, position)
      handleFocusNode(newId)
    },
    [createCanvasObject, handleFocusNode, workflow.nodes.length],
  )

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

  // S5d ②「隐藏条件修正」(node-canvas.md §6.0 owner 拍板，取代 S5b B1-6 的
  // "类型一律隐藏"): a Cast identity node folds hidden only once it has been
  // EATEN by something — i.e. it's the SOURCE of at least one edge (吞噬 =
  // 建边，use-cast-ingest.ts 的 onConnect 恒定 source=身份节点/target=消费者)。
  // 零引用的角色/背景/音色/参考视频卡显示在画布上；拆掉最后一条引用边（成分栏
  // × / 胃取出）时这个 Set 自然少一个 id，卡片下一次渲染就回画布——不需要额外
  // un-hide 逻辑，纯粹从 workflow.edges 派生。S5f A 行⑤复用同一个 Set（改名反映
  // 新用途，不再是 "cast identity 专属"）——散图喂进视频/镜头卡后同样"被吃"。
  const nodeIdsWithOutgoingEdge = useMemo(() => {
    const ids = new Set<string>()
    for (const edge of workflow.edges) {
      ids.add(edge.source)
    }
    return ids
  }, [workflow.edges])
  // 渲染退场（node-canvas.md §6.3「吞噬是纯渲染层折叠」）: fold into ReactFlow
  // `hidden` at RENDER TIME only — the data model (`workflow.nodes`) this
  // derives from is untouched, so undo/save/reload all still see the real
  // graph. Shot/frame image cards ("镜头图卡" — 中鱼) are deliberately NOT in
  // `isCastIdentityNode`, so they stay visible regardless of edges.
  // S5c 三.3 追加同一条规矩（S5d 对齐到同一条"有下游引用才隐藏"）: a loose
  // image node fused into a character/background's referenceAssets
  // (`data.fusedIntoNodeId` set) folds hidden the same way — still a
  // `hidden` flag on the real node, never a filtered array, so 拆出
  // (extract) just clears the flag to bring it back.
  // S5f A 行⑤：a loose (role-less) image dragged directly into a shot/video
  // node builds a real EDGE (not a referenceAssets fusion — see
  // `handleNodeDragStop`), so it folds via the SAME "has an outgoing edge"
  // rule instead of a third flag. Scoped to `isLooseImageNode` only — shot
  // images ("镜头图卡") stay excluded on purpose, matching the comment above.
  // Folded node ids (shared by renderedNodes below AND renderedEdges' "两端
  // 可见" guard — the SAME 判定, not a second copy of it, per R3-1's
  // instruction to reuse one source of truth).
  // A1 perf fix (canvas-relationship-v3-2026-07 §7b): `workflow.nodes` gets a
  // brand new ARRAY reference on every drag frame (`applyNodeChanges` inside
  // `onNodesChange`), even though only the dragged node's x/y actually
  // changed — but fold status only depends on `fusedIntoNodeId` + type +
  // outgoing-edges, none of which move during a drag. Splitting this into a
  // cheap signature string (built every render — plain string concat, no
  // Set allocation) + a Set memo keyed on THAT primitive means the Set (and
  // everything reading it downstream — `renderedNodes`, `renderedEdges`)
  // only gets a new identity when a node's fold-relevant fields actually
  // change, not on every position tick.
  const foldedNodeIdsSignature = useMemo(() => {
    let signature = ''
    for (const node of workflow.nodes) {
      const hasOutgoingEdge = nodeIdsWithOutgoingEdge.has(node.id)
      // Cast identity cards (角色/场景) stay on the canvas even when eaten —
      // the 卡匣 is a mirror tray, not the only surface. Only fused loose
      // images (referenceAssets path) and loose images with an outgoing edge
      // fold hidden.
      const shouldFold =
        Boolean(node.data.fusedIntoNodeId) ||
        (isLooseImageNode(node) && hasOutgoingEdge)
      if (shouldFold) signature += node.id + '|'
    }
    return signature
  }, [workflow.nodes, nodeIdsWithOutgoingEdge])
  const foldedNodeIds = useMemo(
    () =>
      new Set(
        foldedNodeIdsSignature
          ? foldedNodeIdsSignature.split('|').filter(Boolean)
          : [],
      ),
    [foldedNodeIdsSignature],
  )
  // A1 perf fix: a VISIBLE node already passes through unchanged (same
  // reference) below, but a FOLDED one used to get a brand new
  // `{...node, hidden: true}` wrapper object on every single render — so
  // during a drag (new `workflow.nodes` array every frame, but
  // `applyNodeChanges` preserves the object reference of every node OTHER
  // than the one being dragged, and a folded node can never itself be the
  // one being dragged, it's hidden) every folded/eaten card was allocating a
  // fresh wrapper each frame for no reason. This cache reuses the previous
  // wrapper as long as the underlying node object reference is unchanged, so
  // a canvas with a lot of eaten cast/散图 history doesn't pay a
  // proportional-to-history cost on every drag frame.
  const foldedNodeWrapperCacheRef = useRef<
    Map<string, { source: NodeWorkflowNode; wrapped: NodeWorkflowNode }>
  >(new Map())
  const renderedNodes = useMemo(() => {
    const cache = foldedNodeWrapperCacheRef.current
    const stillFolded = new Set<string>()
    const nodes = workflow.nodes.map((node) => {
      if (!foldedNodeIds.has(node.id)) return node
      stillFolded.add(node.id)
      const cached = cache.get(node.id)
      if (cached && cached.source === node) return cached.wrapped
      const wrapped = { ...node, hidden: true }
      cache.set(node.id, { source: node, wrapped })
      return wrapped
    })
    // Prune entries for nodes that un-folded or were removed, so the cache
    // doesn't grow unbounded across a long editing session.
    for (const id of cache.keys()) {
      if (!stillFolded.has(id)) cache.delete(id)
    }
    return nodes
  }, [workflow.nodes, foldedNodeIds])

  // R3-1 选中集合（canvas-relationship-v3 §2.2）: `workflow.nodes[].selected`
  // already round-trips through `workflow.onNodesChange` (applyNodeChanges
  // handles the 'select' change ReactFlow dispatches on click / marquee), so
  // this is a plain derived read — no separate selection store needed.
  // A1 perf fix: same signature/Set split as `foldedNodeIds` above —
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
      if (foldedNodeIds.has(edge.source) || foldedNodeIds.has(edge.target)) {
        return false
      }
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
    [workflow.nodes, foldedNodeIds, selectedNodeIds, relationsCollapsed],
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
  // handler" pattern `handleFuseLooseImageNode` already uses) and
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
  // across drag frames, same technique as `foldedNodeIdsSignature` /
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

      const bothEndsVisible =
        !foldedNodeIds.has(edge.source) && !foldedNodeIds.has(edge.target)
      if (!bothEndsVisible) {
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
    foldedNodeIds,
    selectedNodeIds,
    relationsCollapsed,
    signedEdgePairs,
    fadingEdges,
  ])

  // WorkspaceLayout owns assistant geometry, so stage chrome only needs its
  // local edge inset. No control guesses or duplicates the rail width.
  const bottomRowInsetPx = {
    left: NODE_STUDIO_BOTTOM_DOCK.canvasInsetPx,
    right: NODE_STUDIO_BOTTOM_DOCK.canvasInsetPx,
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

  // S5c 三.3 融合（散图→角色/背景卡）: the ONLY data mutation is appending a
  // `source:'canvas'` referenceAssets entry on the target + folding the loose
  // source node hidden (`fusedIntoNodeId`) — no edge, unlike Cast-card ingest
  // (吞噬 = 建边). Legality mirrors evaluateCastIngest's vocabulary (illegal
  // target / duplicate / capacity-full) without importing that hook: the
  // gesture here is canvas-node-drag-driven (`onNodeDragStop`), not the
  // Cast-card pointer engine, so it earns its own small check instead of
  // forcing a shared abstraction across two different drag origins.
  const handleFuseLooseImageNode = useCallback(
    (sourceNodeId: string, targetNodeId: string): boolean => {
      const sourceNode = workflow.nodes.find((node) => node.id === sourceNodeId)
      const targetNode = workflow.nodes.find((node) => node.id === targetNodeId)
      if (!sourceNode || !targetNode) return false
      if (!isLegalLooseImageFuseTarget(sourceNode, targetNode)) return false

      const existing = targetNode.data.referenceAssets ?? []
      const mediaUrl =
        typeof sourceNode.data.mediaUrl === 'string'
          ? sourceNode.data.mediaUrl.trim()
          : ''
      const name =
        typeof sourceNode.data.mediaLabel === 'string' &&
        sourceNode.data.mediaLabel.trim()
          ? sourceNode.data.mediaLabel.trim()
          : undefined
      // S5d ③: a loose image already classified before fusion (e.g. 关键帧首)
      // keeps that category inside the card's gallery instead of resetting
      // to the default `identity` role.
      const categorySeed = sourceNode.data.imageCategory
        ? {
            role: sourceNode.data.imageCategory,
            customLabel: sourceNode.data.imageCategoryLabel,
          }
        : undefined

      workflow.updateNodeData(targetNodeId, {
        referenceAssets: [
          ...existing,
          createReferenceAsset(
            mediaUrl,
            NODE_STUDIO_REFERENCE_SOURCE_IDS.canvas,
            sourceNodeId,
            name,
            categorySeed,
          ),
        ],
      })
      workflow.updateNodeData(sourceNodeId, { fusedIntoNodeId: targetNodeId })
      return true
    },
    [workflow],
  )

  // S5c 三.4 拆出（对称无损，「拆出 = 落画布」）: a canvas-sourced reference
  // un-hides its origin node in place; an upload/asset/paste-sourced one
  // materializes a fresh loose node at the viewport center — either path
  // leaves the character/background's referenceAssets one entry shorter.
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
          workflow.updateNodeData(originNodeId, { fusedIntoNodeId: undefined })
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
      if (isCanvasIngestDragSource(node)) {
        setCanvasNodeDragActive(true)
        dragStartPositionsRef.current.set(node.id, {
          x: node.position.x,
          y: node.position.y,
        })
        // A1 perf: snapshot every other card's rect ONCE for the whole
        // gesture — see `buildCanvasDragRectCache`'s doc comment for why a
        // drag-start snapshot is safe (target cards don't move mid-drag).
        dragRectCacheRef.current = buildCanvasDragRectCache(node.id)
      }
    },
    [],
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

      // 行④ (fuse) vs 行①②③⑤ (edge ingest) — same dispatch rule the drop
      // handler below uses: a loose image dropped on a collector card fuses
      // into its referenceAssets gallery, everything else goes through the
      // general connection-matrix check.
      const legal =
        isLooseImageNode(node) && isCollectorCardNode(targetNode)
          ? isLegalLooseImageFuseTarget(node, targetNode)
          : evaluateCastIngest(node, targetNode, workflow.edges, workflow.nodes)
              .legal
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

  // S5c 三.3「onNodeDragStop 包围盒命中检测」(任务包原话) + S5f A 扩面 — reuses
  // ReactFlow's OWN native node-drag lifecycle (nodes are already draggable
  // for plain repositioning) instead of standing up a second custom
  // pointer/ghost engine for canvas-node-initiated ingest gestures. The
  // dragged NODE ITSELF is the visual "flight" for onscreen repositioning,
  // but S5d's urgent fix adds back a real 吸入 flight ghost
  // (`playCanvasFuseSwallowAnimation`) for the ingest beat itself — this
  // hit-tests the drop point against currently-rendered canvas nodes / Cast
  // cards (`data-cast-card-node-id`) and plays the full three-beat (张口
  // already applied by `handleNodeDrag` above, 吸入 + 落定 here) on a legal
  // ingest, or the reject shake otherwise. Dropping on empty canvas or a
  // non-card element is a no-op — the node simply stays wherever the native
  // drag left it, a perfectly legal resting position (§三.1 散图 = 合法稳态,
  // and equally true of a zero-reference collector/voice/videoReference card
  // that was just dragged across open canvas).
  const handleNodeDragStop = useCallback(
    (event: ReactMouseEvent, node: NodeWorkflowNode) => {
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

      // Capture the DRAGGED node's own rendered card BEFORE mutating — both
      // branches below fold this node `hidden` on the NEXT render (fusion via
      // `fusedIntoNodeId`, ingest via the new outgoing edge). The ghost clone
      // is a snapshot taken while it's still on screen, so the flight starts
      // from exactly where the node visually sits.
      const sourceEl = findNodeCardElement(node.id)

      if (isLooseImageNode(node) && isCollectorCardNode(targetNode)) {
        // 行④ 融合（散图→角色/背景卡，referenceAssets，无边）— S5c/S5d 原样。
        const fused = handleFuseLooseImageNode(node.id, targetNode.id)
        if (fused) {
          const targetNodeIdForAnimation = targetNode.id
          const announceFused = () =>
            toast.success(t('ingest.looseImageFused'), {
              duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
              position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
            })
          if (sourceEl) {
            playCanvasFuseSwallowAnimation(
              sourceEl,
              targetNodeIdForAnimation,
              announceFused,
            )
          } else {
            // No DOM element found for the dragged node (shouldn't normally
            // happen) — degrade to the target's own gulp bounce, same as
            // before this fix, so the fuse itself never silently loses its
            // feedback.
            playTargetGulpAnimation(hit.cardElement)
            announceFused()
          }
          return
        }
        playTargetRejectShakeAnimation(hit.cardElement)
        toast.error(t('ingest.looseImageFuseRejected'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      // S5f A 行①②③⑤: general edge-based ingest — same legality
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

        // 行⑤ 折叠源（loose image 直接落到 shot/video，§2.6 折叠规则：这条边一
        // 旦建立，该节点就会在下一次渲染折叠隐藏，§2.7 动效分流表要求它"三拍吞
        // 噬现状完全保留"）——不改。
        if (isLooseImageNode(node)) {
          const announceIngested = () =>
            toast.success(t('ingest.canvasNodeIngested'), {
              duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
              position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
            })
          if (sourceEl) {
            playCanvasFuseSwallowAnimation(
              sourceEl,
              targetNode.id,
              announceIngested,
            )
          } else {
            playTargetGulpAnimation(hit.cardElement)
            announceIngested()
          }
          return
        }

        // 行①②③ 非折叠源（收集器卡/音色/参考视频）——§2.7「墨线签署」: the
        // source node never folds (isCanvasIngestDragSource's collector/
        // voice/videoReference branches never enter `foldedNodeIds`), so the
        // old "fly into the target and vanish" ghost was lying — the real
        // card sat underneath the ghost the whole time, unchanged, reading
        // as "swallowed but still there". Replace it with the honest beats:
        // target 轻咽 + edge draws in (via `scheduleEdgeSigning` marking the
        // pair, `renderedEdges` force-showing it, `NodeWorkflowStatusEdge`
        // playing the dash-in on its own) + the dragged card's OWN element
        // sliding back to where the drag started.
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
      handleFuseLooseImageNode,
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
          workflow.updateNodeData(newNodeId, {
            imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
            mediaKind: NODE_MEDIA_KIND_IDS.image,
            mediaUrl: result.url,
            mediaLabel: result.name,
            sourceLabel: result.name,
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

  const workflowActions = useMemo(
    () => ({
      updateNodeData: workflow.updateNodeData,
      updateEdgeData: workflow.updateEdgeData,
      placeDerivedImages: workflow.placeDerivedImages,
      setScriptDoc: workflow.setScriptDoc,
      setDefaultVideoModel: workflow.setDefaultVideoModel,
      setCanvasAppearance: workflow.setCanvasAppearance,
      setScriptDocStage: workflow.setScriptDocStage,
      setScriptDocDepth: workflow.setScriptDocDepth,
      setScriptDocLocks: workflow.setScriptDocLocks,
      applyScriptDocToGraph: workflow.applyScriptDocToGraph,
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
      generateMediaNode: handleGenerateMediaNode,
      enhanceSeedancePrompt: handleEnhanceSeedancePrompt,
      focusGeneratedNodes: handleFocusGeneratedNodes,
      focusNode: handleFocusNode,
      spawnReference: handleSpawnReference,
      fuseLooseImageNode: handleFuseLooseImageNode,
      extractReference: handleExtractReference,
      toolMode,
      setToolMode,
      expandedNodeId,
      setExpandedNodeId,
      heavyOverlayOpen,
      setImageEditWorkspaceOpen,
      transientLayerOpen,
      multiSelectActive,
      modelOptionsByType,
      defaultVideoModel: workflow.defaultVideoModel,
      scriptDocStage: workflow.scriptDocStage,
      scriptDocDepth: workflow.scriptDocDepth,
      scriptDocLocks: workflow.scriptDocLocks,
      // R3-8 C1 场记条: reuse the same project name CanvasTopBar already
      // renders — no new data source, just threaded one level deeper.
      projectName: workflow.currentProjectName,
    }),
    [
      expandedNodeId,
      heavyOverlayOpen,
      setImageEditWorkspaceOpen,
      transientLayerOpen,
      multiSelectActive,
      handleDeleteEdgeWithSignOff,
      handleEnhanceSeedancePrompt,
      handleFocusGeneratedNodes,
      handleFocusNode,
      handleSpawnReference,
      handleFuseLooseImageNode,
      handleExtractReference,
      handleGenerateCharacterImage,
      handleGenerateMediaNode,
      modelOptionsByType,
      setToolMode,
      toolMode,
      workflow.canRedo,
      workflow.canUndo,
      workflow.deleteNode,
      workflow.placeDerivedImages,
      workflow.redo,
      workflow.setScriptDoc,
      workflow.setDefaultVideoModel,
      workflow.setCanvasAppearance,
      workflow.setScriptDocStage,
      workflow.setScriptDocDepth,
      workflow.setScriptDocLocks,
      workflow.defaultVideoModel,
      workflow.scriptDocStage,
      workflow.scriptDocDepth,
      workflow.scriptDocLocks,
      workflow.applyScriptDocToGraph,
      workflow.undo,
      workflow.updateEdgeData,
      workflow.updateNodeData,
      workflow.currentProjectName,
    ],
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
        assistant={
          <StudioNodeAssistantDock
            open={assistantDockOpen}
            expanded={assistantExpanded}
            projectId={workflow.currentProjectId}
            projectName={workflow.currentProjectName}
            nodes={workflow.nodes}
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
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={handlePaneContextMenu}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onDrop={handleCanvasDrop}
            onDragOver={handleCanvasDragOver}
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
            // §2.4 端口锚点化退场: binding only happens via 吞噬/快投 now, so
            // drag-a-new-connection-from-a-port is switched off at the
            // workbench level too (Handle's own isConnectable={false}
            // already blocks it per-port; this is the belt to that
            // suspenders).
            nodesConnectable={false}
            elementsSelectable
            panOnDrag={panOnDrag}
            panActivationKeyCode={NODE_STUDIO_CANVAS.panActivationKeyCode}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            zoomOnScroll
            // R3-3 §3.1: double-click is reserved for opening the ⤢ detail
            // panel (`onNodeDoubleClick` above) — the library's default
            // double-click-to-zoom is not part of the interaction canon.
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
            <CanvasMiniMap />
            <VideoMergeComposeToolbar
              nodeIds={composeSelectionNodeIds}
              onCompose={handleComposeVideoMerge}
            />
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
              projects={workflow.projects}
              currentProjectId={workflow.currentProjectId}
              canvasAppearance={workflow.canvasAppearance}
              onCanvasAppearanceChange={workflow.setCanvasAppearance}
              onAddClick={handleTopbarAddClick}
              onArrange={handleTidyLayout}
              onSave={handleSaveNow}
              isSaving={isSaving}
              onCreateProject={handleCreateProject}
              onRenameProject={handleRenameProject}
              onDeleteProject={handleDeleteProject}
              onSwitchProject={handleSwitchProject}
            />
            {/* Bottom chrome: tools + 卡匣 handle share one centered row. */}
            <div
              className="pointer-events-none absolute bottom-3 z-canvas-chrome flex items-end justify-center gap-2"
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
              />
              <CastDock
                onCreateCard={handleCastCreate}
                // A4 ①: 之前传 0/0——展开条只顶着把手自己的窄框展开，从没真的
                // 撑到过助手 rail 边界。改传这条行本身已经在用的 inset（同一套
                // 安全区，助手宽度早已在 bottomRowInsetPx 里扣除，这里不重算）；
                // CastDock 内部把它换算成"行内局部坐标"去定位展开条。
                insetLeft={bottomRowInsetPx.left}
                insetRight={bottomRowInsetPx.right}
                canvasDragActive={canvasNodeDragActive}
                layout="inline"
                forceCollapse={castDockForceCollapse}
                onExpandedChange={setCastDockExpanded}
              />
            </div>
            <CanvasAddMenu
              open={Boolean(addMenu)}
              screenPosition={addMenu?.menuPosition ?? null}
              onSelect={handleAddNode}
              onClose={closeAddMenu}
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
