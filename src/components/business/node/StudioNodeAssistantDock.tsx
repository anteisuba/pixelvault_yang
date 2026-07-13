'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Globe,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelRightClose,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
} from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useAssistantConversation,
  type AssistantConversationMessage,
} from '@/hooks/use-assistant-conversation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import type { AppLocale } from '@/i18n/routing'
import {
  createNodeAssistantSessionId,
  listNodeAssistantSessions,
  saveNodeAssistantSession,
  titleFromMessages,
  type NodeAssistantHistorySession,
} from '@/lib/node-assistant-history'
import type { NodeAssistantNodeContext } from '@/types/node-assistant'
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
  const conversation = useAssistantConversation()
  const [assistantRoute, setAssistantRoute] =
    useState<NodeAssistantRouteSelection>({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    })
  const [researchEnabled, setResearchEnabled] = useState(false)
  const [modality, setModality] = useState<CanvasAssistantModality>('image')
  const [sessionId, setSessionId] = useState(() =>
    createNodeAssistantSessionId(),
  )
  const [sessions, setSessions] = useState<NodeAssistantHistorySession[]>([])
  const isMobile = useIsMobile()

  const refreshSessions = useCallback(() => {
    setSessions(listNodeAssistantSessions(projectId))
  }, [projectId])

  useEffect(() => {
    refreshSessions()
    // Switching projects starts a fresh local session for the new project.
    setSessionId(createNodeAssistantSessionId())
    conversation.clear()
    // Intentionally only re-run on projectId — conversation identity is stable
    // enough for clear(), and we must not wipe on every messages update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshSessions])

  const persistSession = useCallback(
    (messages: AssistantConversationMessage[]) => {
      if (messages.length === 0) return
      saveNodeAssistantSession(projectId, {
        id: sessionId,
        title: titleFromMessages(messages, tHistory('new')),
        updatedAt: new Date().toISOString(),
        messages,
      })
      refreshSessions()
    },
    [projectId, refreshSessions, sessionId, tHistory],
  )

  useEffect(() => {
    if (conversation.isLoading) return
    if (conversation.messages.length === 0) return
    persistSession(conversation.messages)
  }, [conversation.isLoading, conversation.messages, persistSession])

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
    () => selection.nodes.map((node) => node.id),
    [selection.nodes],
  )

  const buildConversationContext = useCallback(
    () => ({
      nodes: nodeContexts,
      selectedNodeIds,
      locale,
      apiKeyId: assistantRoute.apiKeyId,
      research: researchEnabled,
    }),
    [
      assistantRoute.apiKeyId,
      locale,
      nodeContexts,
      researchEnabled,
      selectedNodeIds,
    ],
  )

  const handleSend = useCallback(
    async (content: string) => {
      const prefix =
        modality === 'video'
          ? tConversation('modalityPrefix.video')
          : tConversation('modalityPrefix.image')
      const body =
        content.startsWith('[') || !prefix ? content : `${prefix}\n${content}`
      await conversation.send(body, buildConversationContext())
    },
    [buildConversationContext, conversation, modality, tConversation],
  )

  const handleRetry = useCallback(async () => {
    await conversation.retry(buildConversationContext())
  }, [buildConversationContext, conversation])

  const handleNewConversation = useCallback(() => {
    if (conversation.messages.length > 0) {
      persistSession(conversation.messages)
    }
    setSessionId(createNodeAssistantSessionId())
    conversation.clear()
  }, [conversation, persistSession])

  const handleSelectHistory = useCallback(
    (id: string) => {
      const target = listNodeAssistantSessions(projectId).find(
        (session) => session.id === id,
      )
      if (!target) return
      if (conversation.messages.length > 0) {
        persistSession(conversation.messages)
      }
      setSessionId(target.id)
      conversation.load(target.messages)
      refreshSessions()
    },
    [conversation, persistSession, projectId, refreshSessions],
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

      <aside
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

        <div className="flex items-center justify-between gap-2 border-b border-node-panel-inner px-3 py-2.5 lg:px-4 lg:py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-node-foreground">
              {tHistory('new')}
            </p>
            <p className="truncate text-2xs font-medium text-node-muted">
              {projectName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 lg:gap-1">
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
            <CanvasAssistantHistory
              sessions={sessions}
              activeSessionId={sessionId}
              onSelect={handleSelectHistory}
            />
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
          </div>
        </div>

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
            />
          </div>
        )}
      </aside>
    </>
  )
}
