'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Bot,
  Globe,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelRightClose,
  Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useAssistantConversation,
  type AssistantCapabilityReference,
} from '@/hooks/use-assistant-conversation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
import type { AppLocale } from '@/i18n/routing'
import type {
  NodeAssistantMediaReference,
  NodeAssistantNodeContext,
} from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import { AssistantConversation } from './AssistantConversation'
import { CanvasAssistantHistory } from './CanvasAssistantHistory'
import {
  CanvasAssistantModalityMenu,
  type CanvasAssistantModality,
} from './CanvasAssistantModalityMenu'
import {
  CanvasAssistantRouteSelector,
  type NodeAssistantRouteSelection,
} from './CanvasAssistantRouteSelector'
import { ScriptDocWorkspace } from './ScriptDocWorkspace'
import {
  AssistantShell,
  AssistantShellHeader,
} from '@/components/business/assistant/AssistantShell'
import { createAssistantConversationShareAPI } from '@/lib/api-client/assistant-conversation'

interface StudioNodeAssistantDockProps {
  open: boolean
  expanded: boolean
  projectId: string
  projectName: string
  nodes: NodeWorkflowNode[]
  scriptDoc: ScriptDoc | undefined
  locale: AppLocale
  onOpenChange(open: boolean): void
  onExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
}

function truncateNodeText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`
    : trimmed
}

function getNodeTitle(node: NodeWorkflowNode, fallbackTitle: string): string {
  if (node.type === NODE_TYPE_IDS.characterImage) {
    return node.data.characterName ?? node.data.character?.name ?? fallbackTitle
  }

  if (node.type === NODE_TYPE_IDS.agent) {
    return (
      node.data.seedancePromptPlan?.title ??
      node.data.breakdown?.title ??
      fallbackTitle
    )
  }

  return fallbackTitle
}

function getNodeSummary(node: NodeWorkflowNode): string | undefined {
  if (node.type === NODE_TYPE_IDS.agent) {
    return (
      node.data.seedancePromptPlan?.finalPrompt ??
      node.data.breakdown?.logline ??
      node.data.generationError
    )
  }

  if (node.type === NODE_TYPE_IDS.characterImage) {
    return node.data.prompt || node.data.imageUrl
  }

  return node.data.prompt
}

function isHttpMediaUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getAssistantMediaReferences(
  nodes: NodeWorkflowNode[],
  getNodeTypeLabel: (type: NodeWorkflowNode['type']) => string,
): NodeAssistantMediaReference[] {
  const references: NodeAssistantMediaReference[] = []

  for (const node of nodes) {
    const url =
      typeof node.data.mediaUrl === 'string' && node.data.mediaUrl.trim()
        ? node.data.mediaUrl.trim()
        : typeof node.data.imageUrl === 'string' && node.data.imageUrl.trim()
          ? node.data.imageUrl.trim()
          : ''
    // Schema requires absolute http(s) URLs — skip data/blob/relative paths.
    if (!url || !isHttpMediaUrl(url)) continue

    const kind =
      node.data.mediaKind === NODE_MEDIA_KIND_IDS.video ||
      node.type === NODE_TYPE_IDS.seedance ||
      node.type === NODE_TYPE_IDS.videoReference ||
      node.type === NODE_TYPE_IDS.videoMerge
        ? 'video'
        : node.data.mediaKind === NODE_MEDIA_KIND_IDS.image ||
            node.type === NODE_TYPE_IDS.image ||
            node.type === NODE_TYPE_IDS.characterImage ||
            node.type === NODE_TYPE_IDS.backgroundImage ||
            node.type === NODE_TYPE_IDS.frameImage ||
            node.type === NODE_TYPE_IDS.shot
          ? 'image'
          : null
    if (!kind) continue

    const label =
      node.data.mediaLabel?.trim() ||
      node.data.sourceLabel?.trim() ||
      getNodeTypeLabel(node.type)
    const videoThumb =
      typeof node.data.videoThumbnailUrl === 'string'
        ? node.data.videoThumbnailUrl.trim()
        : ''
    references.push({
      id: `node-reference:${node.id}`,
      nodeId: node.id,
      kind,
      url,
      ...(kind === 'video' && videoThumb && isHttpMediaUrl(videoThumb)
        ? { thumbnailUrl: videoThumb }
        : kind === 'image'
          ? { thumbnailUrl: url }
          : {}),
      label,
    })
  }

  return references.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxReferences)
}

export function StudioNodeAssistantDock({
  open,
  expanded,
  projectId,
  projectName,
  nodes,
  scriptDoc,
  locale,
  onOpenChange,
  onExpandedChange,
  onFocusNode,
}: StudioNodeAssistantDockProps) {
  const t = useTranslations('StudioNode.dock')
  const tAssistant = useTranslations('StudioNode.assistant')
  const tHistory = useTranslations('StudioNode.history')
  const tNodeTypes = useTranslations('StudioNode.nodeTypes')
  const tConversation = useTranslations('StudioNode.conversation')
  const selection = useNodeSelection()
  const { placeDerivedImages, focusNode } = useNodeWorkflowActions()
  const conversation = useAssistantConversation({ projectId, persist: true })
  const [assistantRoute, setAssistantRoute] =
    useState<NodeAssistantRouteSelection>({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    })
  const [researchEnabled, setResearchEnabled] = useState(false)
  const [modality, setModality] = useState<CanvasAssistantModality>('image')
  const [lastReferences, setLastReferences] = useState<
    NodeAssistantMediaReference[]
  >([])
  const isMobile = useIsMobile()

  const dockStyle = isMobile
    ? {
        bottom: 'var(--keyboard-inset, 0px)',
        height:
          'min(65svh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
        maxHeight: 'calc(100svh - var(--keyboard-inset, 0px) - 0.75rem)',
      }
    : undefined

  const nodeContexts = useMemo<NodeAssistantNodeContext[]>(
    () =>
      nodes.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodes).map((node) => {
        const fallbackTitle = tNodeTypes(node.type)
        const summary = getNodeSummary(node)

        return {
          id: node.id,
          type: node.type,
          status: node.data.status,
          title: truncateNodeText(
            getNodeTitle(node, fallbackTitle),
            NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength,
          ),
          summary: summary
            ? truncateNodeText(
                summary,
                NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
              )
            : undefined,
        }
      }),
    [nodes, tNodeTypes],
  )

  const selectedNodeIds = useMemo(
    () =>
      selection.nodes
        .map((node) => node.id)
        .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes),
    [selection.nodes],
  )

  const referenceOptions = useMemo(
    () => getAssistantMediaReferences(nodes, tNodeTypes),
    [nodes, tNodeTypes],
  )

  const buildConversationContext = useCallback(
    () => ({
      nodes: nodeContexts,
      selectedNodeIds,
      references: lastReferences,
      locale,
      apiKeyId: assistantRoute.apiKeyId,
      research: researchEnabled,
    }),
    [
      assistantRoute.apiKeyId,
      locale,
      nodeContexts,
      lastReferences,
      researchEnabled,
      selectedNodeIds,
    ],
  )

  const handleSend = useCallback(
    async (content: string, references?: NodeAssistantMediaReference[]) => {
      const prefix =
        modality === 'video'
          ? tConversation('modalityPrefix.video')
          : tConversation('modalityPrefix.image')
      const body =
        content.startsWith('[') || !prefix ? content : `${prefix}\n${content}`
      setLastReferences(references ?? [])
      await conversation.send(body, {
        ...buildConversationContext(),
        references: references ?? [],
      })
    },
    [buildConversationContext, conversation, modality, tConversation],
  )

  const handleRetry = useCallback(async () => {
    await conversation.retry(buildConversationContext())
  }, [buildConversationContext, conversation])

  const handleRunCapability = useCallback(
    async ({ capability, nodeId }: AssistantCapabilityReference) => {
      const node = nodes.find((candidate) => candidate.id === nodeId)
      const sourceUrl =
        typeof node?.data.mediaUrl === 'string' && node.data.mediaUrl.trim()
          ? node.data.mediaUrl.trim()
          : typeof node?.data.imageUrl === 'string' && node.data.imageUrl.trim()
            ? node.data.imageUrl.trim()
            : ''
      if (!node || !sourceUrl) {
        toast.error(tConversation('capabilityUnavailable'))
        return
      }

      const sourceWidth =
        typeof node.data.mediaWidth === 'number' && node.data.mediaWidth > 0
          ? node.data.mediaWidth
          : 1024
      const sourceHeight =
        typeof node.data.mediaHeight === 'number' && node.data.mediaHeight > 0
          ? node.data.mediaHeight
          : 1024
      const descriptor = canvasCapabilityRuntime.open(capability)
      const response = await canvasCapabilityRuntime.run(
        capability === 'upscale'
          ? {
              capability,
              target: {
                sourceUrl,
                sourceGenerationId: node.data.generationId,
                sourceWidth,
                sourceHeight,
              },
              targetScale: '4x',
              modelId: descriptor.defaultModelId ?? '',
            }
          : {
              capability,
              target: {
                sourceUrl,
                sourceGenerationId: node.data.generationId,
                sourceWidth,
                sourceHeight,
              },
              modelId: descriptor.defaultModelId ?? '',
            },
      )
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || tConversation('capabilityFailed'))
        return
      }
      const derivedNodeIds =
        placeDerivedImages?.(node.id, response.outputs) ?? []
      if (derivedNodeIds[0]) focusNode?.(derivedNodeIds[0])
    },
    [focusNode, nodes, placeDerivedImages, tConversation],
  )

  const handleNewConversation = useCallback(() => {
    conversation.clear()
  }, [conversation])

  const handleSelectHistory = useCallback(
    (id: string) => {
      void conversation.selectSession(id)
    },
    [conversation],
  )

  const handleShareConversation = useCallback(async () => {
    if (!conversation.sessionId) {
      toast.error(tHistory('shareFailed'))
      return
    }

    const result = await createAssistantConversationShareAPI(
      conversation.sessionId,
    )
    if (!result.success) {
      toast.error(tHistory('shareFailed'))
      return
    }

    const shareUrl = `${window.location.origin}/${locale}/assistant/share/${result.data.token}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(tHistory('shareCopied'))
    } catch {
      toast.error(tHistory('shareFailed'))
    }
  }, [conversation.sessionId, locale, tHistory])

  const historySessions = useMemo(
    () =>
      conversation.sessions.map((session) => ({
        id: session.id,
        title: session.title ?? tHistory('new'),
        updatedAt: session.updatedAt,
        messages: [],
      })),
    [conversation.sessions, tHistory],
  )

  const getNodeLabel = useCallback(
    (nodeId: string) => {
      const nodeContext = nodeContexts.find((node) => node.id === nodeId)
      return nodeContext?.title ?? nodeId
    },
    [nodeContexts],
  )

  const dockStarters = useMemo(() => {
    if (modality === 'video') {
      return [
        {
          id: 'videoShot',
          label: t('starters.videoShot.label'),
          prompt: t('starters.videoShot.prompt'),
        },
        {
          id: 'videoMerge',
          label: t('starters.videoMerge.label'),
          prompt: t('starters.videoMerge.prompt'),
        },
        {
          id: 'firstPhase',
          label: t('starters.firstPhase.label'),
          prompt: t('starters.firstPhase.prompt'),
        },
      ]
    }
    return [
      {
        id: 'scriptOutline',
        label: t('starters.scriptOutline.label'),
        prompt: t('starters.scriptOutline.prompt'),
      },
      {
        id: 'castStyle',
        label: t('starters.castStyle.label'),
        prompt: t('starters.castStyle.prompt'),
      },
      {
        id: 'firstPhase',
        label: t('starters.firstPhase.label'),
        prompt: t('starters.firstPhase.prompt'),
      },
    ]
  }, [modality, t])

  // The opener line must reflect canvas state — claiming "still empty" while the
  // user has nodes (or an outline) reads as a bug. Switch to an active opener
  // once there's anything on the canvas.
  const opener =
    nodes.length > 0 || scriptDoc ? t('leanOpenerActive') : t('leanOpener')

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={tAssistant('toggle')}
          title={tAssistant('toggle')}
          style={
            isMobile
              ? { bottom: 'calc(6rem + var(--keyboard-inset, 0px))' }
              : undefined
          }
          className="pointer-events-auto absolute bottom-24 right-4 inline-flex size-12 items-center justify-center gap-2 rounded-full border border-node-panel-inner bg-node-panel text-node-foreground shadow-sm transition-colors hover:border-node-edge hover:bg-node-panel-inner lg:bottom-auto lg:right-6 lg:top-20 lg:size-auto lg:h-10 lg:rounded-lg lg:px-3 lg:text-xs lg:font-semibold lg:shadow-none"
        >
          <Bot className="size-5 text-node-muted lg:size-4" />
          <span className="hidden lg:inline">{tAssistant('toggle')}</span>
        </button>
      ) : null}

      <AssistantShell
        style={dockStyle}
        inert={!open}
        aria-hidden={!open}
        data-mode={expanded ? 'script' : 'chat'}
        className={cn(
          // Haivis §3.1: desktop rail is a plain full-height column (1px left
          // edge, no radius/blur/heavy shadow). Mobile keeps a sheet chrome.
          'pointer-events-auto absolute inset-x-0 bottom-0 top-auto flex h-[65vh] animate-in flex-col overflow-hidden rounded-t-2xl border border-b-0 border-node-panel-inner bg-node-panel text-node-foreground shadow-sm fade-in slide-in-from-bottom-4 duration-300 lg:relative lg:inset-auto lg:h-full lg:w-full lg:animate-none lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-node-panel-inner lg:bg-node-panel lg:shadow-none',
          !open && 'hidden lg:flex lg:pointer-events-none lg:opacity-0',
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t('collapse')}
          className="flex h-5 shrink-0 items-center justify-center lg:hidden"
        >
          <span
            className="h-1 w-10 rounded-full bg-node-panel-inner"
            aria-hidden
          />
        </button>

        <AssistantShellHeader
          title={tHistory('new')}
          subtitle={projectName}
          className="border-node-panel-inner px-3 py-2.5 lg:px-4 lg:py-3 [&_p]:text-node-foreground [&_p+ p]:text-node-muted"
          actions={
            <>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tHistory('new')}
                onClick={handleNewConversation}
                className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <MessageSquarePlus className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tConversation('research')}
                aria-pressed={researchEnabled}
                title={tConversation('researchHint')}
                onClick={() => setResearchEnabled((prev) => !prev)}
                className={cn(
                  'rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground',
                  researchEnabled &&
                    'bg-node-foreground text-node-canvas hover:bg-node-foreground hover:text-node-canvas',
                )}
              >
                <Globe className="size-4" />
              </Button>
              <CanvasAssistantRouteSelector
                value={assistantRoute}
                onChange={setAssistantRoute}
              />
              <CanvasAssistantHistory
                sessions={historySessions}
                activeSessionId={conversation.sessionId}
                onSelect={handleSelectHistory}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={tHistory('share')}
                title={tHistory('share')}
                onClick={() => void handleShareConversation()}
                className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <Share2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={expanded ? t('restore') : t('expand')}
                onClick={() => onExpandedChange(!expanded)}
                className="hidden rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground lg:inline-flex"
              >
                {expanded ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('collapse')}
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <PanelRightClose className="size-4" />
              </Button>
            </>
          }
        />

        {expanded && !isMobile ? (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col border-r border-node-panel-inner">
              <AssistantConversation
                messages={conversation.messages}
                isLoading={conversation.isLoading}
                error={conversation.error}
                onSend={handleSend}
                onRetry={handleRetry}
                onFocusNode={onFocusNode}
                getNodeLabel={getNodeLabel}
                emptyHint={opener}
                starters={dockStarters}
                composerTools={
                  <CanvasAssistantModalityMenu
                    value={modality}
                    onChange={setModality}
                  />
                }
                referenceOptions={referenceOptions}
                onRunCapability={handleRunCapability}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ScriptDocWorkspace
                scriptDoc={scriptDoc}
                messages={conversation.messages}
                locale={locale}
                apiKeyId={assistantRoute.apiKeyId}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <AssistantConversation
              messages={conversation.messages}
              isLoading={conversation.isLoading}
              error={conversation.error}
              onSend={handleSend}
              onRetry={handleRetry}
              onFocusNode={onFocusNode}
              getNodeLabel={getNodeLabel}
              emptyHint={opener}
              starters={dockStarters}
              composerTools={
                <CanvasAssistantModalityMenu
                  value={modality}
                  onChange={setModality}
                />
              }
              referenceOptions={referenceOptions}
              onRunCapability={handleRunCapability}
            />
          </div>
        )}
      </AssistantShell>
    </>
  )
}
