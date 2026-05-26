'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Bot,
  MessageSquarePlus,
  PanelRightClose,
  Sparkles,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
} from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { useAssistantConversation } from '@/hooks/use-assistant-conversation'
import { useNodeSelection } from '@/hooks/use-node-selection'
import type { AppLocale } from '@/i18n/routing'
import type { NodeAssistantNodeContext } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'
import { cn } from '@/lib/utils'

import { AssistantConversation } from './AssistantConversation'
import {
  CanvasAssistantRouteSelector,
  type NodeAssistantRouteSelection,
} from './CanvasAssistantRouteSelector'
import { AgentInspector } from './inspector/AgentInspector'
import { BackgroundImageInspector } from './inspector/BackgroundImageInspector'
import { CharacterImageInspector } from './inspector/CharacterImageInspector'
import { ComposerInspector } from './inspector/ComposerInspector'
import { FrameImageInspector } from './inspector/FrameImageInspector'
import { SeedanceInspector } from './inspector/SeedanceInspector'
import { ShotInspector } from './inspector/ShotInspector'
import { ShotTextInspector } from './inspector/ShotTextInspector'
import { VideoMergeInspector } from './inspector/VideoMergeInspector'
import { VideoReferenceInspector } from './inspector/VideoReferenceInspector'
import { VoiceInspector } from './inspector/VoiceInspector'

interface StudioNodeAssistantDockProps {
  open: boolean
  projectName: string
  nodes: NodeWorkflowNode[]
  locale: AppLocale
  onOpenChange(open: boolean): void
  onFocusNode(nodeId: string): void
}

function truncateNodeText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}…`
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

function InspectorPanel({
  selection,
}: {
  selection: ReturnType<typeof useNodeSelection>
}) {
  const t = useTranslations('StudioNode.inspector')

  if (selection.mode === 'none') {
    return <WelcomeView />
  }

  if (selection.mode === 'multi') {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-4">
          <Users className="mt-0.5 size-5 shrink-0 text-node-amber" />
          <div>
            <p className="text-sm font-semibold text-node-foreground">
              {t('multiTitle', { count: selection.nodes.length })}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t('multiDescription')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const primary = selection.primary
  if (!primary) {
    return <WelcomeView />
  }

  if (primary.type === NODE_TYPE_IDS.composer) {
    return <ComposerInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.agent) {
    return <AgentInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.shotText) {
    return <ShotTextInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.shot) {
    return <ShotInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.characterImage) {
    return <CharacterImageInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.backgroundImage) {
    return <BackgroundImageInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.frameImage) {
    return <FrameImageInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.voice) {
    return <VoiceInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.seedance) {
    return <SeedanceInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.videoReference) {
    return <VideoReferenceInspector node={primary} />
  }

  if (primary.type === NODE_TYPE_IDS.videoMerge) {
    return <VideoMergeInspector node={primary} />
  }

  return (
    <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-4 text-sm text-node-muted">
      {t('unsupported')}
    </div>
  )
}

function WelcomeView() {
  const t = useTranslations('StudioNode.dock')

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-node-panel-inner text-node-amber">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-node-foreground">
              {t('welcomeTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t('welcomeDescription')}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {(
          [
            'welcomeSkillScript',
            'welcomeSkillRoute',
            'welcomeSkillGenerate',
          ] as const
        ).map((key) => (
          <div
            key={key}
            className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-xs leading-5 text-node-muted"
          >
            {t(key)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function StudioNodeAssistantDock({
  open,
  projectName,
  nodes,
  locale,
  onOpenChange,
  onFocusNode,
}: StudioNodeAssistantDockProps) {
  const t = useTranslations('StudioNode.dock')
  const tAssistant = useTranslations('StudioNode.assistant')
  const tNodeTypes = useTranslations('StudioNode.nodeTypes')
  const selection = useNodeSelection()
  const conversation = useAssistantConversation()
  const [assistantRoute, setAssistantRoute] =
    useState<NodeAssistantRouteSelection>({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    })

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
    () => selection.nodes.map((node) => node.id),
    [selection.nodes],
  )

  const buildConversationContext = useCallback(
    () => ({
      nodes: nodeContexts,
      selectedNodeIds,
      locale,
      apiKeyId: assistantRoute.apiKeyId,
    }),
    [assistantRoute.apiKeyId, locale, nodeContexts, selectedNodeIds],
  )

  const handleSend = useCallback(
    async (content: string) => {
      await conversation.send(content, buildConversationContext())
    },
    [buildConversationContext, conversation],
  )

  const handleRetry = useCallback(async () => {
    await conversation.retry(buildConversationContext())
  }, [buildConversationContext, conversation])

  const getNodeLabel = useCallback(
    (nodeId: string) => {
      const nodeContext = nodeContexts.find((node) => node.id === nodeId)
      return nodeContext?.title ?? nodeId
    },
    [nodeContexts],
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="pointer-events-auto absolute right-6 top-24 inline-flex h-10 items-center gap-2 rounded-xl border border-node-panel-inner/80 bg-node-panel/95 px-3 text-xs font-semibold text-node-foreground shadow-node-panel backdrop-blur-xl transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner"
      >
        <Bot className="size-4 text-node-amber" />
        {tAssistant('toggle')}
      </button>
    )
  }

  return (
    <aside className="pointer-events-auto absolute bottom-4 right-4 top-20 flex w-96 flex-col overflow-hidden rounded-2xl border border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl lg:w-studio-right">
      <div className="flex items-center justify-between gap-2 border-b border-node-panel-inner px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-node-foreground">
            {projectName}
          </p>
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('title')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('newConversation')}
            onClick={conversation.clear}
            className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
          >
            <MessageSquarePlus className="size-4" />
          </Button>
          <CanvasAssistantRouteSelector
            value={assistantRoute}
            onChange={setAssistantRoute}
          />
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
        </div>
      </div>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto border-b border-node-panel-inner px-4 py-4',
          selection.mode === 'none' ? 'basis-44' : 'basis-auto',
        )}
      >
        <InspectorPanel selection={selection} />
      </div>

      <AssistantConversation
        messages={conversation.messages}
        isLoading={conversation.isLoading}
        error={conversation.error}
        onSend={handleSend}
        onRetry={handleRetry}
        onFocusNode={onFocusNode}
        getNodeLabel={getNodeLabel}
      />
    </aside>
  )
}
