'use client'

import {
  useCallback,
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
  useReactFlow,
  type DefaultEdgeOptions,
  type NodeChange,
  type NodeTypes,
  type XYPosition,
} from '@xyflow/react'
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
  NODE_STUDIO_VIDEO_PROMPT,
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
import {
  getReferenceCapabilityMax,
  getVideoReferenceCapability,
} from '@/constants/reference-image-capabilities'
import { useCharacterImageGeneration } from '@/hooks/use-character-image-generation'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import { useNodeMediaGeneration } from '@/hooks/use-node-media-generation'
import { useNodeWorkflow } from '@/hooks/use-node-workflow'
import { useScriptBreakdown } from '@/hooks/use-script-breakdown'
import { useWorkflowModelOptions } from '@/hooks/use-workflow-model-options'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'
import type { AdvancedParams } from '@/types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'
import { getApiErrorMessage } from '@/lib/api-error-message'

import { CanvasAddMenu } from './CanvasAddMenu'
import { CanvasBottomDock } from './CanvasBottomDock'
import { CanvasMiniMap } from './CanvasMiniMap'
import { CanvasTopBar } from './CanvasTopBar'
import { NodeWorkflowActionsProvider } from './NodeWorkflowActionsContext'
import { StudioNodeAssistantDock } from './StudioNodeAssistantDock'
import { AgentNode } from './nodes/AgentNode'
import { BackgroundImageNode } from './nodes/BackgroundImageNode'
import { CharacterImageNode } from './nodes/CharacterImageNode'
import { ComposerNode } from './nodes/ComposerNode'
import { FrameImageNode } from './nodes/FrameImageNode'
import { SeedanceNode } from './nodes/SeedanceNode'
import { ShotNode } from './nodes/ShotNode'
import { ShotTextNode } from './nodes/ShotTextNode'
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

function truncateVideoPromptItem(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')

  return trimmed.length > NODE_STUDIO_VIDEO_PROMPT.maxItemLength
    ? `${trimmed.slice(0, NODE_STUDIO_VIDEO_PROMPT.maxItemLength - 3)}...`
    : trimmed
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

function isString(value: string | undefined): value is string {
  return Boolean(value)
}

function isVideoVisualReferenceNode(node: NodeWorkflowNode): boolean {
  return (
    node.type === NODE_TYPE_IDS.characterImage ||
    node.type === NODE_TYPE_IDS.shot ||
    node.type === NODE_TYPE_IDS.backgroundImage
  )
}

function isVideoKeyframeNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.frameImage
}

function isVideoVoiceNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.voice
}

function isVideoShotTextNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.shotText
}

function getNodeOutputUrl(node: NodeWorkflowNode): string | undefined {
  return node.data.imageUrl ?? node.data.mediaUrl
}

function getNodeContextLabel(node: NodeWorkflowNode): string {
  return (
    node.data.characterName ??
    node.data.character?.name ??
    node.data.voiceName ??
    node.data.voiceId ??
    node.data.mediaLabel ??
    node.data.sourceLabel ??
    node.data.breakdown?.title ??
    node.type
  )
}

function getIncomingNodes(
  targetId: string,
  nodes: NodeWorkflowNode[],
  edges: NodeWorkflowEdge[],
): NodeWorkflowNode[] {
  const sourceIds = new Set(
    edges.filter((edge) => edge.target === targetId).map((edge) => edge.source),
  )

  return nodes.filter((node) => sourceIds.has(node.id))
}

function formatUpstreamNodePrompt(node: NodeWorkflowNode): string {
  const label = getNodeContextLabel(node)
  const fieldPrompt = buildNodeWorkflowPrompt(node.type, node.data)
  const details = [
    label,
    fieldPrompt,
    node.data.voiceProvider,
    node.data.voiceId,
    node.data.voiceReferenceAudioName,
  ]
    .filter(isString)
    .map(truncateVideoPromptItem)

  return uniqueStrings(details).join(' | ')
}

function buildVideoGenerationPrompt(
  videoNode: NodeWorkflowNode,
  nodes: NodeWorkflowNode[],
  edges: NodeWorkflowEdge[],
  basePrompt: string,
): string {
  const incomingNodes = getIncomingNodes(videoNode.id, nodes, edges)
  const visualLines = incomingNodes
    .filter(isVideoVisualReferenceNode)
    .map(formatUpstreamNodePrompt)
    .filter(Boolean)
  const keyframeLines = incomingNodes
    .filter(isVideoKeyframeNode)
    .map(formatUpstreamNodePrompt)
    .filter(Boolean)
  const shotTextLines = incomingNodes
    .filter(isVideoShotTextNode)
    .map(formatUpstreamNodePrompt)
    .filter(Boolean)
  const voiceLines = incomingNodes
    .filter(isVideoVoiceNode)
    .map(formatUpstreamNodePrompt)
    .filter(Boolean)

  const sections = [
    basePrompt.trim(),
    visualLines.length > 0
      ? `${NODE_STUDIO_VIDEO_PROMPT.sections.visualReferences}:\n- ${visualLines.join('\n- ')}`
      : '',
    keyframeLines.length > 0
      ? `${NODE_STUDIO_VIDEO_PROMPT.sections.keyframes}:\n- ${keyframeLines.join('\n- ')}`
      : '',
    shotTextLines.length > 0
      ? `${NODE_STUDIO_VIDEO_PROMPT.sections.shotText}:\n- ${shotTextLines.join('\n- ')}`
      : '',
    voiceLines.length > 0
      ? `${NODE_STUDIO_VIDEO_PROMPT.sections.voiceProfiles}:\n- ${voiceLines.join('\n- ')}`
      : '',
  ].filter(Boolean)

  return sections
    .join('\n\n')
    .slice(0, NODE_STUDIO_VIDEO_PROMPT.maxPromptLength)
}

function getVideoReferenceImages(
  videoNode: NodeWorkflowNode,
  nodes: NodeWorkflowNode[],
  edges: NodeWorkflowEdge[],
  maxReferenceImages: number,
): string[] {
  const incomingNodes = getIncomingNodes(videoNode.id, nodes, edges)
  const incomingReferences = incomingNodes
    .filter(
      (node) => isVideoVisualReferenceNode(node) || isVideoKeyframeNode(node),
    )
    .map(getNodeOutputUrl)
    .filter(isString)

  const directReferences = (videoNode.data.referenceAssets ?? []).map(
    (reference) => reference.url,
  )

  return uniqueStrings([...directReferences, ...incomingReferences]).slice(
    0,
    maxReferenceImages,
  )
}

export function StudioNodeWorkbench() {
  const canvasRef = useRef<HTMLElement | null>(null)

  return (
    <section
      ref={canvasRef}
      className="dark relative h-[calc(100vh-3rem)] min-h-[36rem] overflow-hidden bg-node-canvas text-node-foreground"
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
  const workflow = useNodeWorkflow({
    defaultProjectName: t('projectUntitled'),
  })
  const scriptBreakdown = useScriptBreakdown()
  const characterImageGeneration = useCharacterImageGeneration()
  const nodeMediaGeneration = useNodeMediaGeneration()
  const modelOptionsByType = useWorkflowModelOptions()
  const { fitView, screenToFlowPosition } = useReactFlow<
    NodeWorkflowNode,
    NodeWorkflowEdge
  >()
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null)
  const [assistantDockOpen, setAssistantDockOpen] = useState(true)

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
    const projectName = window
      .prompt(
        t('topbar.createProjectPrompt'),
        t('projectNewDefaultName', { n: workflow.projects.length + 1 }),
      )
      ?.trim()

    if (!projectName) {
      return
    }

    workflow.createProject(projectName)
    toast.success(t('toasts.projectCreated', { name: projectName }), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [t, workflow])

  const handleRenameProject = useCallback(() => {
    const projectName = window
      .prompt(t('topbar.renameProjectPrompt'), workflow.currentProjectName)
      ?.trim()

    if (!projectName || projectName === workflow.currentProjectName) {
      return
    }

    workflow.renameCurrentProject(projectName)
    toast.success(t('toasts.projectRenamed', { name: projectName }), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [t, workflow])

  const handleDeleteProject = useCallback(() => {
    const shouldDelete = window.confirm(
      t('topbar.deleteProjectConfirm', {
        name: workflow.currentProjectName,
      }),
    )

    if (!shouldDelete) {
      return
    }

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
        generationError: undefined,
        plannerApiKeyId,
        plannerProvider,
        plannerRouteOptionId,
        status: NODE_STATUS_IDS.running,
      })

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

      const failureMessage = getApiErrorMessage(
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
    [appLocale, scriptBreakdown, t, tErrors, workflow],
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

      const failureMessage = getApiErrorMessage(
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
      const basePrompt = node
        ? buildNodeWorkflowPrompt(node.type, node.data)
        : ''
      const prompt =
        node?.type === NODE_TYPE_IDS.seedance
          ? buildVideoGenerationPrompt(
              node,
              workflow.nodes,
              workflow.edges,
              basePrompt,
            )
          : basePrompt
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

      if (!prompt) {
        toast.info(t('mediaNodes.noPrompt'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const isImageMediaNode = kind === NODE_MEDIA_KIND_IDS.image
      const isVideoMediaNode = kind === NODE_MEDIA_KIND_IDS.video
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

      const maxReferenceImages = isVideoMediaNode
        ? getReferenceCapabilityMax(getVideoReferenceCapability(model.modelId))
        : getMaxReferenceImages(model.adapterType, model.modelId)
      const existingImageReference =
        isImageMediaNode &&
        node.data.imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
          ? node.data.mediaUrl
          : undefined
      const directReferenceImages = [
        ...(existingImageReference ? [existingImageReference] : []),
        ...(node.data.referenceAssets ?? []).map((reference) => reference.url),
      ]
      const videoReferenceImages =
        node.type === NODE_TYPE_IDS.seedance
          ? getVideoReferenceImages(
              node,
              workflow.nodes,
              workflow.edges,
              maxReferenceImages,
            )
          : []
      const referenceImages = uniqueStrings([
        ...directReferenceImages,
        ...videoReferenceImages,
      ]).slice(0, maxReferenceImages)
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
      const advancedParams: AdvancedParams | undefined =
        loras.length > 0 ? { loras } : undefined

      const upstreamVoiceId = isVideoMediaNode
        ? workflow.edges
            .filter((edge) => edge.target === nodeId)
            .map((edge) =>
              workflow.nodes.find((candidate) => candidate.id === edge.source),
            )
            .find(
              (upstream) =>
                upstream?.type === NODE_TYPE_IDS.voice &&
                typeof upstream.data.voiceId === 'string' &&
                upstream.data.voiceId.length > 0,
            )?.data.voiceId
        : undefined

      const result = await nodeMediaGeneration.generate({
        kind,
        modelId: model.modelId,
        apiKeyId: model.apiKeyId,
        prompt,
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
        advancedParams,
        voiceId:
          typeof upstreamVoiceId === 'string' && upstreamVoiceId.length > 0
            ? upstreamVoiceId
            : undefined,
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

      const failureMessage = getApiErrorMessage(
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

  const workflowActions = useMemo(
    () => ({
      updateNodeData: workflow.updateNodeData,
      updateScriptBreakdown: workflow.updateScriptBreakdown,
      spawnCharactersFromBreakdown: workflow.spawnCharactersFromBreakdown,
      deleteNode: workflow.deleteNode,
      sendFromComposer: handleSendFromComposer,
      generateCharacterImage: handleGenerateCharacterImage,
      generateMediaNode: handleGenerateMediaNode,
      modelOptionsByType,
    }),
    [
      handleGenerateCharacterImage,
      handleGenerateMediaNode,
      handleSendFromComposer,
      modelOptionsByType,
      workflow.deleteNode,
      workflow.spawnCharactersFromBreakdown,
      workflow.updateNodeData,
      workflow.updateScriptBreakdown,
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
          panOnScroll
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
        <div className="pointer-events-none absolute inset-0 z-10">
          <CanvasTopBar
            nodeCount={workflow.nodes.length}
            projectName={workflow.currentProjectName}
            projects={workflow.projects}
            currentProjectId={workflow.currentProjectId}
            onAddClick={handleTopbarAddClick}
            onCreateProject={handleCreateProject}
            onRenameProject={handleRenameProject}
            onDeleteProject={handleDeleteProject}
            onSwitchProject={handleSwitchProject}
          />
          <StudioNodeAssistantDock
            open={assistantDockOpen}
            projectName={workflow.currentProjectName}
            nodes={workflow.nodes}
            locale={appLocale}
            onOpenChange={setAssistantDockOpen}
            onFocusNode={handleFocusNode}
          />
          <CanvasBottomDock />
          <CanvasAddMenu
            open={Boolean(addMenu)}
            screenPosition={addMenu?.menuPosition ?? null}
            onSelect={handleAddNode}
            onClose={closeAddMenu}
          />
        </div>
      </NodeWorkflowActionsProvider>
    </>
  )
}
