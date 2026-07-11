'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type RefObject,
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
import { PanelTopOpen } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_BOTTOM_DOCK,
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_DOCK,
  NODE_STUDIO_DOCK_RESIZE,
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
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { DEFAULT_ASPECT_RATIO } from '@/constants/config'
import { INGEST_MOTION } from '@/constants/motion'
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
  playCanvasFuseSwallowAnimation,
  playTargetGulpAnimation,
  playTargetRejectShakeAnimation,
  type CastIngestEvaluation,
} from '@/hooks/node/use-cast-ingest'
import { useCanvasImageDrop } from '@/hooks/node/use-canvas-image-drop'
import {
  createDefaultNodeData,
  useNodeWorkflow,
} from '@/hooks/node/use-node-workflow'
import { useWorkflowModelOptions } from '@/hooks/use-workflow-model-options'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'
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
  buildReferenceImageIndexByName,
  translatePromptTokensToPositional,
} from '@/lib/node-video-prompt-translation'
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
import { CanvasTopBar } from './CanvasTopBar'
import { CastDock, isCastIdentityNode, type CastSectionId } from './CastDock'
import { createReferenceAsset } from './CharacterImageReferenceControls'
import { IngestDragProvider, type QuickThrowApi } from './IngestDragLayer'
import { NodeCanvasEmptyGuide } from './NodeCanvasEmptyGuide'
import {
  NodeWorkflowActionsProvider,
  type SpawnReferenceInput,
} from './NodeWorkflowActionsContext'
import { ProjectNameDialog } from './ProjectNameDialog'
import { StudioNodeAssistantDock } from './StudioNodeAssistantDock'
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
  const canvasRef = useRef<HTMLElement | null>(null)

  return (
    <section
      ref={canvasRef}
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
        <StudioNodeCanvas canvasRef={canvasRef} />
      </ReactFlowProvider>
    </section>
  )
}

interface StudioNodeCanvasProps {
  canvasRef: RefObject<HTMLElement | null>
}

function StudioNodeCanvas({ canvasRef }: StudioNodeCanvasProps) {
  const t = useTranslations('StudioNode')
  const tErrors = useTranslations('Errors')
  const locale = useLocale()
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
  const { fitView, screenToFlowPosition } = useReactFlow<
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
  const [toolMode, setToolMode] = useState<NodeStudioToolMode>(
    NODE_STUDIO_TOOL_MODE_IDS.pointer,
  )
  const [topbarOpen, setTopbarOpen] = useState(true)
  const [projectDialogMode, setProjectDialogMode] = useState<
    'create' | 'rename' | null
  >(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Mobile UX: the AssistantDock spans left-4 → right-4 below md, so leaving
  // it default-open hides the canvas entirely on a phone. Close it on first
  // paint when the viewport is narrow; desktop keeps the default-open layout.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 767px)').matches) {
      setAssistantDockOpen(false)
      setAssistantExpanded(false)
    }
  }, [])

  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE

  const closeAddMenu = useCallback(() => {
    setAddMenu(null)
  }, [])

  // S5f B2 快投模式: the provider publishes its live API here; canvas event
  // handlers below read it at click time (they live outside the provider).
  const quickThrowApiRef = useRef<QuickThrowApi | null>(null)

  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: NodeWorkflowNode) => {
      // In quick-throw mode a node click feeds the source into it (a no-op for
      // illegal/already-included targets, checked inside feedQuickThrow) —
      // NOT the normal select/expand. Out of mode: fall through to default.
      const api = quickThrowApiRef.current
      if (api?.quickThrowSource) api.feedQuickThrow(node.id)
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

  const handleAddNode = useCallback(
    (type: NodeWorkflowNodeType, role?: NodeImageRole) => {
      if (!addMenu) {
        return
      }

      const newId = workflow.addNode(type, addMenu.flowPosition)
      // S5d ③「镜头图（生成）」add-menu row: stamp role immediately (same
      // role-preset-on-creation pattern CastDock.handleCastCreate uses for
      // character/background) so it never passes through the (now retired)
      // on-canvas role picker.
      if (role) {
        workflow.updateNodeData(newId, {
          ...createDefaultNodeData(NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role]),
          role,
        })
      }
      closeAddMenu()
    },
    [addMenu, closeAddMenu, workflow],
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
      const referenceImages = [
        ...(existingImageReference ? [existingImageReference] : []),
        ...(node.data.referenceAssets ?? []).map((reference) => reference.url),
      ].slice(0, maxReferenceImages)
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
            ...harvestUpstreamImageUrls(upstreamNodes),
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
      const dedupedReferenceImages: string[] = []
      const seenReferenceImages = new Set<string>()
      const pushReference = (url: string | undefined) => {
        if (!url) return
        if (seenReferenceImages.has(url)) return
        seenReferenceImages.add(url)
        dedupedReferenceImages.push(url)
      }
      if (existingImageReference) pushReference(existingImageReference)
      for (const asset of node.data.referenceAssets ?? []) {
        pushReference(asset.url)
      }
      for (const url of upstreamImageUrls) {
        pushReference(url)
      }
      for (const reference of upstreamImageReferences) {
        pushReference(reference.url)
      }
      const referenceImages = dedupedReferenceImages.slice(
        0,
        maxReferenceImages,
      )
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
      const referenceLegend = isShotImageNode
        ? buildShotReferenceLegend(referenceImages, referenceByUrl)
        : isVideoMediaNode
          ? buildVideoReferenceLegend({
              referenceImages,
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
      // media kinds (empty map → returned verbatim).
      const imageIndexByName = isVideoMediaNode
        ? buildReferenceImageIndexByName(
            referenceImages,
            videoImageRefByUrl,
            videoImageAutoNamePrefix,
          )
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
        referenceImages.length > 0 ||
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
            referenceImages.length > 0 ? referenceImages : undefined,
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
            ? { videoThumbnailUrl: result.thumbnailUrl }
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

      if (
        sectionId === NODE_IMAGE_ROLE_IDS.character ||
        sectionId === NODE_IMAGE_ROLE_IDS.background
      ) {
        const newId = workflow.addNode(NODE_TYPE_IDS.image, position)
        workflow.updateNodeData(newId, {
          ...createDefaultNodeData(NODE_IMAGE_ROLE_TO_LEGACY_TYPE[sectionId]),
          role: sectionId,
        })
        handleFocusNode(newId)
        return
      }

      const newId = workflow.addNode(sectionId, position)
      handleFocusNode(newId)
    },
    [handleFocusNode, workflow],
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
  const renderedNodes = useMemo(
    () =>
      workflow.nodes.map((node) => {
        const hasOutgoingEdge = nodeIdsWithOutgoingEdge.has(node.id)
        const shouldFold =
          (isCastIdentityNode(node) && hasOutgoingEdge) ||
          Boolean(node.data.fusedIntoNodeId) ||
          (isLooseImageNode(node) && hasOutgoingEdge)
        return shouldFold ? { ...node, hidden: true } : node
      }),
    [workflow.nodes, nodeIdsWithOutgoingEdge],
  )
  // 连线渲染退场: every edge goes into the store flagged `hidden` — ReactFlow
  // paints nothing, but `useEdges()` consumers (成分栏 / DepartmentStrip 参考
  // 面板 / CastDock 出演计数 / inspectors) still see the full graph. Handing
  // <ReactFlow> an EMPTY array instead would starve all of them (they read the
  // render store, not `workflow.edges`). Reverting the whole slice is a
  // one-line change back to `workflow.edges` here.
  const renderedEdges = useMemo<NodeWorkflowEdge[]>(
    () => workflow.edges.map((edge) => ({ ...edge, hidden: true })),
    [workflow.edges],
  )

  // S5b B0: shared inset for the merged bottom row (toolbar + Cast handle) —
  // the same "clear the assistant dock" math CanvasBottomDock/CastDock used
  // to each compute on their own before the merge.
  const bottomRowInsetPx = useMemo(() => {
    const assistantDockWidthPx = assistantExpanded
      ? NODE_STUDIO_DOCK_RESIZE.expandedWidthPx
      : NODE_STUDIO_DOCK_RESIZE.defaultWidthPx
    const right = assistantDockOpen
      ? assistantDockWidthPx +
        NODE_STUDIO_BOTTOM_DOCK.canvasInsetPx +
        NODE_STUDIO_BOTTOM_DOCK.assistantGapPx
      : NODE_STUDIO_BOTTOM_DOCK.canvasInsetPx
    return { left: NODE_STUDIO_BOTTOM_DOCK.canvasInsetPx, right }
  }, [assistantDockOpen, assistantExpanded])

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
      workflow.deleteEdge(edge.id)
      toast.success(t('toasts.edgeDeleted'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [t, toolMode, workflow],
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

  // S5f B4 把手热区: a boolean (toggled once per drag on start/stop, NOT
  // per-frame — the proximity check itself lives inside CastDock's own
  // listener, gated on this flag, so no re-render thrash). Only an ingest
  // source counts — plain repositioning of a video/shot node shouldn't pop
  // the dock open.
  const [canvasNodeDragActive, setCanvasNodeDragActive] = useState(false)

  const handleNodeDragStart = useCallback(
    (_event: ReactMouseEvent, node: NodeWorkflowNode) => {
      if (isCanvasIngestDragSource(node)) setCanvasNodeDragActive(true)
    },
    [],
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

      const hit = findCanvasDragHit(event, node.id)
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

      playTargetRejectShakeAnimation(hit.cardElement)
      toast.error(t('ingest.canvasNodeIngestRejected'), {
        description: translateIngestReason(evaluation),
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [
      handleFuseLooseImageNode,
      handleIngestConnect,
      t,
      translateIngestReason,
      workflow.edges,
      workflow.nodes,
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
      setScriptDoc: workflow.setScriptDoc,
      setDefaultVideoModel: workflow.setDefaultVideoModel,
      setScriptDocStage: workflow.setScriptDocStage,
      setScriptDocDepth: workflow.setScriptDocDepth,
      setScriptDocLocks: workflow.setScriptDocLocks,
      applyScriptDocToGraph: workflow.applyScriptDocToGraph,
      deleteNode: workflow.deleteNode,
      deleteEdge: workflow.deleteEdge,
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
      modelOptionsByType,
      defaultVideoModel: workflow.defaultVideoModel,
      scriptDocStage: workflow.scriptDocStage,
      scriptDocDepth: workflow.scriptDocDepth,
      scriptDocLocks: workflow.scriptDocLocks,
    }),
    [
      expandedNodeId,
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
      workflow.deleteEdge,
      workflow.deleteNode,
      workflow.redo,
      workflow.setScriptDoc,
      workflow.setDefaultVideoModel,
      workflow.setScriptDocStage,
      workflow.setScriptDocDepth,
      workflow.setScriptDocLocks,
      workflow.defaultVideoModel,
      workflow.scriptDocStage,
      workflow.scriptDocDepth,
      workflow.scriptDocLocks,
      workflow.applyScriptDocToGraph,
      workflow.undo,
      workflow.updateNodeData,
    ],
  )

  return (
    <>
      <NodeWorkflowActionsProvider value={workflowActions}>
        <IngestDragProvider
          nodes={workflow.nodes}
          edges={workflow.edges}
          onConnect={handleIngestConnect}
          quickThrowApiRef={quickThrowApiRef}
        >
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
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onDrop={handleCanvasDrop}
            onDragOver={handleCanvasDragOver}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultViewport={NODE_STUDIO_CANVAS.defaultViewport}
            defaultEdgeOptions={NODE_STUDIO_DEFAULT_EDGE_OPTIONS}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={NODE_STUDIO_CONNECTION_LINE_STYLE}
            proOptions={NODE_STUDIO_REACT_FLOW_PRO_OPTIONS}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            panOnDrag={panOnDrag}
            panActivationKeyCode={NODE_STUDIO_CANVAS.panActivationKeyCode}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            zoomOnScroll
            fitView={false}
            className="bg-node-canvas"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={NODE_STUDIO_CANVAS.background.gap}
              size={NODE_STUDIO_CANVAS.background.size}
              color={NODE_STUDIO_CANVAS.background.color}
            />
            <CanvasMiniMap />
          </ReactFlow>
          {workflow.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-x-4 bottom-24 top-20 z-[5] flex items-center justify-center md:left-8 md:right-[30rem] md:bottom-16 md:top-24">
              <NodeCanvasEmptyGuide
                onChatOutline={() => {
                  setAssistantDockOpen(true)
                  setAssistantExpanded(true)
                }}
                onAddNode={handleTopbarAddClick}
              />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 z-10">
            {topbarOpen ? (
              <CanvasTopBar
                nodeCount={workflow.nodes.length}
                projectName={workflow.currentProjectName}
                projects={workflow.projects}
                currentProjectId={workflow.currentProjectId}
                onAddClick={handleTopbarAddClick}
                onArrange={handleTidyLayout}
                onSave={handleSaveNow}
                isSaving={isSaving}
                onCreateProject={handleCreateProject}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onSwitchProject={handleSwitchProject}
                onCollapse={() => setTopbarOpen(false)}
              />
            ) : (
              <button
                type="button"
                aria-label={t('topbar.expand')}
                title={t('topbar.expand')}
                onClick={() => setTopbarOpen(true)}
                className="pointer-events-auto absolute left-4 top-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-node-panel-inner/80 bg-node-panel/95 px-3 text-xs font-semibold text-node-foreground shadow-node-panel backdrop-blur-xl transition-colors hover:border-node-focus-ring/40 hover:bg-node-panel-inner md:left-6"
              >
                <PanelTopOpen className="size-4 text-node-foreground" />
                <span className="truncate">{workflow.currentProjectName}</span>
              </button>
            )}
            <StudioNodeAssistantDock
              open={assistantDockOpen}
              expanded={assistantExpanded}
              projectName={workflow.currentProjectName}
              nodes={workflow.nodes}
              scriptDoc={workflow.scriptDoc}
              locale={appLocale}
              onOpenChange={setAssistantDockOpen}
              onExpandedChange={setAssistantExpanded}
              onFocusNode={handleFocusNode}
            />
            {/* Toolbar row — shares the assistant-dock-clearance inset math
                (`bottomRowInsetPx`) that used to also carry the Cast dock's
                pill before S5d ①「卡匣回横匣」moved it back to its own
                horizontal strip (see below), a separate positioned layer so
                it can float ABOVE this row instead of being squeezed inline
                next to it. */}
            <div
              className="pointer-events-none absolute bottom-3 z-10 flex items-center justify-center gap-2"
              style={{
                left: bottomRowInsetPx.left,
                right: bottomRowInsetPx.right,
              }}
            >
              <CanvasBottomDock
                activeMode={toolMode}
                canUndo={workflow.canUndo}
                canRedo={workflow.canRedo}
                assistantExpanded={assistantExpanded}
                onModeChange={setToolMode}
                onUndo={workflow.undo}
                onRedo={workflow.redo}
              />
            </div>
            <CastDock
              onCreateCard={handleCastCreate}
              insetLeft={bottomRowInsetPx.left}
              insetRight={bottomRowInsetPx.right}
              canvasDragActive={canvasNodeDragActive}
            />
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
      </NodeWorkflowActionsProvider>
    </>
  )
}
