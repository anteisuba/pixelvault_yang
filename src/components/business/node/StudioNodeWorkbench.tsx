'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_DOCK,
  NODE_STUDIO_EDGE_VISUALS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { DEFAULT_ASPECT_RATIO } from '@/constants/config'
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
import { useNodeMediaGeneration } from '@/hooks/node/use-node-media-generation'
import { useNodeWorkflow } from '@/hooks/node/use-node-workflow'
import { useWorkflowModelOptions } from '@/hooks/use-workflow-model-options'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'
import {
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  harvestUpstreamImageUrls,
  harvestUpstreamShotTextPrompt,
  harvestUpstreamVideoUrls,
  mergePromptWithUpstreamText,
  summarizeUpstreamSeedanceReferences,
} from '@/lib/node-workflow-graph'
import type { AdvancedParams } from '@/types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import {
  getBrandVariants,
  getSurfacedVideoBrands,
} from '@/lib/video-model-resolver'
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
import { NodeCanvasEmptyGuide } from './NodeCanvasEmptyGuide'
import { NodeWorkflowActionsProvider } from './NodeWorkflowActionsContext'
import { ProjectNameDialog } from './ProjectNameDialog'
import { StudioNodeAssistantDock } from './StudioNodeAssistantDock'
import { NodeDetailPanel } from './node-detail/NodeDetailPanel'
import { AgentNode } from './nodes/AgentNode'
import { BackgroundImageNode } from './nodes/BackgroundImageNode'
import { CharacterImageNode } from './nodes/CharacterImageNode'
import { ComposerNode } from './nodes/ComposerNode'
import { FrameImageNode } from './nodes/FrameImageNode'
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

export function StudioNodeWorkbench() {
  const canvasRef = useRef<HTMLElement | null>(null)

  return (
    <section
      ref={canvasRef}
      className="dark relative h-[calc(100svh-3rem)] min-h-[36rem] overflow-hidden bg-node-canvas text-node-foreground"
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
  const modelOptionsByType = useWorkflowModelOptions()
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
    (type: NodeWorkflowNodeType) => {
      if (!addMenu) {
        return
      }

      workflow.addNode(type, addMenu.flowPosition)
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

      const result = await characterImageGeneration.generate({
        modelId: model.modelId,
        apiKeyId: model.apiKeyId,
        freePrompt: prompt,
        aspectRatio: DEFAULT_ASPECT_RATIO,
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
        advancedParams,
      })

      if (result.success) {
        workflow.updateNodeData(nodeId, {
          generationError: undefined,
          generationId: result.generation.id,
          generationStatus: NODE_GENERATION_STATUS_IDS.success,
          imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
          imageUrl: result.imageUrl,
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
        workflow.updateNodeData(nodeId, {
          generationError: undefined,
          generationStatus: NODE_GENERATION_STATUS_IDS.idle,
          status: NODE_STATUS_IDS.idle,
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

      // Video nodes are graph-aware: they read prompt fragments from upstream
      // shotText nodes, reference images from upstream visual + keyframe nodes,
      // and reference audio from upstream voice nodes. Image / audio nodes
      // ignore upstream content — they only use their own Inspector inputs.
      const upstreamNodes = isVideoMediaNode
        ? getUpstreamNodes(nodeId, workflow.edges, workflow.nodes)
        : []
      const upstreamTextPrompt = isVideoMediaNode
        ? harvestUpstreamShotTextPrompt(upstreamNodes)
        : ''
      const upstreamImageUrls = isVideoMediaNode
        ? harvestUpstreamImageUrls(upstreamNodes)
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
      const referenceImages = dedupedReferenceImages.slice(
        0,
        maxReferenceImages,
      )
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

      const result = await nodeMediaGeneration.generate({
        kind,
        modelId: model.modelId,
        apiKeyId: model.apiKeyId,
        prompt: mergedPrompt,
        duration: videoDuration,
        resolution: videoResolution,
        aspectRatio: videoAspectRatio,
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
        audioUrls: upstreamAudioUrls.length > 0 ? upstreamAudioUrls : undefined,
        audioBindings:
          upstreamAudioBindings.length > 0 ? upstreamAudioBindings : undefined,
        videoUrls: upstreamVideoUrls.length > 0 ? upstreamVideoUrls : undefined,
        voiceId: audioVoiceId,
        speed: audioSpeed,
        volume: audioVolume,
        emotion: audioEmotion,
        negativePrompt,
        generateAudio: videoGenerateAudio,
        seed: videoSeed,
        advancedParams,
      })

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
          mediaKind: kind,
          mediaUrl: result.mediaUrl,
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
        workflow.updateNodeData(nodeId, {
          generationError: undefined,
          generationStatus: NODE_GENERATION_STATUS_IDS.idle,
          status: NODE_STATUS_IDS.idle,
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
        mediaKind: kind,
        status: NODE_STATUS_IDS.failed,
      })
      toast.error(t('toasts.mediaGenerationFailed'), {
        description: failureMessage,
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [nodeMediaGeneration, t, tErrors, workflow],
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

  // Surfaced video brands + their variants drive the topbar default-model
  // chip's dropdown. Only brands with available model options show up.
  const videoBrandOptions = useMemo(
    () =>
      getSurfacedVideoBrands(
        modelOptionsByType[NODE_TYPE_IDS.seedance] ?? [],
      ).map((brand) => ({ brand, variants: getBrandVariants(brand) })),
    [modelOptionsByType],
  )

  const panOnDrag = useMemo(
    () =>
      toolMode === NODE_STUDIO_TOOL_MODE_IDS.hand
        ? true
        : [...NODE_STUDIO_CANVAS.panOnDragButtons],
    [toolMode],
  )

  // §6 connection contract: reject self-loops and any (source→target) node-type
  // pair the strict matrix doesn't allow. Existing edges aren't affected — this
  // only gates new connection attempts.
  const isValidConnection = useCallback(
    (connection: Connection | NodeWorkflowEdge): boolean => {
      const { source, target } = connection
      if (!source || !target || source === target) return false
      const sourceType = workflow.nodes.find((node) => node.id === source)?.type
      const targetType = workflow.nodes.find((node) => node.id === target)?.type
      if (!sourceType || !targetType) return false
      return canConnectNodeTypes(sourceType, targetType)
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

  const workflowActions = useMemo(
    () => ({
      updateNodeData: workflow.updateNodeData,
      setScriptDoc: workflow.setScriptDoc,
      setDefaultVideoModel: workflow.setDefaultVideoModel,
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
      toolMode,
      setToolMode,
      expandedNodeId,
      setExpandedNodeId,
      modelOptionsByType,
      defaultVideoModel: workflow.defaultVideoModel,
    }),
    [
      expandedNodeId,
      handleEnhanceSeedancePrompt,
      handleFocusGeneratedNodes,
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
      workflow.defaultVideoModel,
      workflow.applyScriptDocToGraph,
      workflow.undo,
      workflow.updateNodeData,
    ],
  )

  return (
    <>
      <NodeWorkflowActionsProvider value={workflowActions}>
        <ReactFlow
          nodes={workflow.nodes}
          edges={workflow.edges}
          nodeTypes={NODE_COMPONENTS}
          edgeTypes={NODE_EDGE_COMPONENTS}
          onNodesChange={workflow.onNodesChange}
          onEdgesChange={workflow.onEdgesChange}
          onConnect={workflow.onConnect}
          isValidConnection={isValidConnection}
          onEdgeClick={handleEdgeClick}
          onPaneClick={closeAddMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onNodesDelete={handleNodesDelete}
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
              videoBrandOptions={videoBrandOptions}
              defaultVideoModel={workflow.defaultVideoModel}
              onChangeDefaultVideoModel={workflow.setDefaultVideoModel}
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
          <CanvasBottomDock
            activeMode={toolMode}
            canUndo={workflow.canUndo}
            canRedo={workflow.canRedo}
            onModeChange={setToolMode}
            onUndo={workflow.undo}
            onRedo={workflow.redo}
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
              : t('projectNewDefaultName', { n: workflow.projects.length + 1 })
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
              <AlertDialogCancel>{t('projectDialog.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleConfirmDeleteProject}
              >
                {t('projectDialog.deleteConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </NodeWorkflowActionsProvider>
    </>
  )
}
