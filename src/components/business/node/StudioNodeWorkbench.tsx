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
  type DefaultEdgeOptions,
  type NodeChange,
  type NodeTypes,
  type XYPosition,
} from '@xyflow/react'
import { useAuth } from '@clerk/nextjs'
import { PanelTopOpen } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_AGENT_MODE_IDS,
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
import { useScriptBreakdown } from '@/hooks/node/use-script-breakdown'
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
  const scriptBreakdown = useScriptBreakdown()
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

  const handleSendFromComposer = useCallback(
    async (composerNodeId: string) => {
      const composerNode = workflow.nodes.find(
        (node) => node.id === composerNodeId,
      )
      const idea = composerNode?.data.prompt.trim() ?? ''

      if (!idea) {
        toast.info(t('composer.emptyPromptTip'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const targetAgent = workflow.getOutgoingTargetByType(
        composerNodeId,
        NODE_TYPE_IDS.agent,
      )

      if (!targetAgent) {
        toast.info(t('composer.noTargetTip'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const plannerProvider =
        composerNode?.data.plannerProvider ?? targetAgent.data.plannerProvider
      const plannerApiKeyId =
        composerNode?.data.plannerApiKeyId ?? targetAgent.data.plannerApiKeyId
      const plannerRouteOptionId =
        composerNode?.data.plannerRouteOptionId ??
        targetAgent.data.plannerRouteOptionId

      if (!plannerProvider || !plannerApiKeyId) {
        toast.info(t('composer.noPlannerRouteTip'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      workflow.updateNodeData(composerNodeId, {
        status: NODE_STATUS_IDS.running,
      })
      workflow.updateNodeData(targetAgent.id, {
        agentMode:
          targetAgent.data.agentMode ??
          NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown,
        generationError: undefined,
        plannerApiKeyId,
        plannerProvider,
        plannerRouteOptionId,
        status: NODE_STATUS_IDS.running,
      })

      const agentMode =
        targetAgent.data.agentMode ?? NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown

      if (agentMode === NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt) {
        // Surface the reference assets already wired into the downstream
        // Seedance node so the planner can orchestrate @VideoN / @AudioN
        // tokens with intent. Best-effort: undefined when nothing is wired.
        const targetSeedance = workflow.getOutgoingTargetByType(
          targetAgent.id,
          NODE_TYPE_IDS.seedance,
        )
        const referenceSummary = targetSeedance
          ? summarizeUpstreamSeedanceReferences(
              targetSeedance.id,
              workflow.edges,
              workflow.nodes,
            )
          : null
        const references =
          referenceSummary &&
          (referenceSummary.imageCount > 0 ||
            referenceSummary.videoCount > 0 ||
            referenceSummary.audio.length > 0)
            ? referenceSummary
            : undefined

        const result = await seedancePromptPlan.generate({
          idea,
          plannerProvider,
          apiKeyId: plannerApiKeyId,
          locale: appLocale,
          references,
        })

        if (result.success) {
          workflow.updateSeedancePromptPlan(
            targetAgent.id,
            result.data.plan,
            result.data.planner,
          )
          workflow.updateNodeData(composerNodeId, {
            status: NODE_STATUS_IDS.done,
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

        workflow.updateNodeData(composerNodeId, {
          status: NODE_STATUS_IDS.failed,
        })
        workflow.updateNodeData(targetAgent.id, {
          generationError: failureMessage,
          status: NODE_STATUS_IDS.failed,
        })

        toast.error(t('toasts.seedancePromptPlanFailed'), {
          description: failureMessage,
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const result = await scriptBreakdown.generate({
        idea,
        plannerProvider,
        apiKeyId: plannerApiKeyId,
        locale: appLocale,
      })

      if (result.success) {
        workflow.updateScriptBreakdown(
          targetAgent.id,
          result.data.breakdown,
          result.data.planner,
        )
        workflow.updateNodeData(composerNodeId, {
          status: NODE_STATUS_IDS.done,
        })
        toast.success(t('toasts.generated'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const failureMessage = getGenerationErrorMessage(
        tErrors,
        result,
        t('toasts.scriptBreakdownFailed'),
      )

      workflow.updateNodeData(composerNodeId, {
        status: NODE_STATUS_IDS.failed,
      })
      workflow.updateNodeData(targetAgent.id, {
        generationError: failureMessage,
        status: NODE_STATUS_IDS.failed,
      })

      toast.error(t('toasts.scriptBreakdownFailed'), {
        description: failureMessage,
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [appLocale, scriptBreakdown, seedancePromptPlan, t, tErrors, workflow],
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
      const advancedParams: AdvancedParams | undefined =
        loras.length > 0 || negativePrompt
          ? {
              ...(loras.length > 0 ? { loras } : {}),
              ...(negativePrompt ? { negativePrompt } : {}),
            }
          : undefined

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

  const defaultModelOption = useMemo(
    () =>
      modelOptionsByType[NODE_TYPE_IDS.characterImage]?.[0] ??
      modelOptionsByType[NODE_TYPE_IDS.shot]?.[0] ??
      modelOptionsByType[NODE_TYPE_IDS.seedance]?.[0],
    [modelOptionsByType],
  )

  const panOnDrag = useMemo(
    () =>
      toolMode === NODE_STUDIO_TOOL_MODE_IDS.hand
        ? true
        : [...NODE_STUDIO_CANVAS.panOnDragButtons],
    [toolMode],
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
      updateScriptBreakdown: workflow.updateScriptBreakdown,
      updateSeedancePromptPlan: workflow.updateSeedancePromptPlan,
      spawnCharactersFromBreakdown: workflow.spawnCharactersFromBreakdown,
      spawnFullWorkflowFromAgent: workflow.spawnFullWorkflowFromAgent,
      applySeedancePromptPlanToSeedance:
        workflow.applySeedancePromptPlanToSeedance,
      setScriptDoc: workflow.setScriptDoc,
      applyScriptDocToGraph: workflow.applyScriptDocToGraph,
      deleteNode: workflow.deleteNode,
      deleteEdge: workflow.deleteEdge,
      undo: workflow.undo,
      redo: workflow.redo,
      canUndo: workflow.canUndo,
      canRedo: workflow.canRedo,
      sendFromComposer: handleSendFromComposer,
      generateCharacterImage: handleGenerateCharacterImage,
      generateMediaNode: handleGenerateMediaNode,
      focusGeneratedNodes: handleFocusGeneratedNodes,
      toolMode,
      setToolMode,
      modelOptionsByType,
    }),
    [
      handleFocusGeneratedNodes,
      handleGenerateCharacterImage,
      handleGenerateMediaNode,
      handleSendFromComposer,
      modelOptionsByType,
      setToolMode,
      toolMode,
      workflow.canRedo,
      workflow.canUndo,
      workflow.deleteEdge,
      workflow.deleteNode,
      workflow.applySeedancePromptPlanToSeedance,
      workflow.redo,
      workflow.setScriptDoc,
      workflow.applyScriptDocToGraph,
      workflow.spawnCharactersFromBreakdown,
      workflow.spawnFullWorkflowFromAgent,
      workflow.undo,
      workflow.updateNodeData,
      workflow.updateScriptBreakdown,
      workflow.updateSeedancePromptPlan,
    ],
  )

  return (
    <>
      <NodeWorkflowActionsProvider value={workflowActions}>
        <ReactFlow
          nodes={workflow.nodes}
          edges={workflow.edges}
          nodeTypes={NODE_COMPONENTS}
          onNodesChange={workflow.onNodesChange}
          onEdgesChange={workflow.onEdgesChange}
          onConnect={workflow.onConnect}
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
              defaultModelLabel={defaultModelOption?.modelId}
              defaultModelMeta={defaultModelOption?.providerConfig.label}
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
