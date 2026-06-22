'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Bot,
  GripVertical,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelRightClose,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
  NODE_STUDIO_DOCK_RESIZE,
} from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { useAssistantConversation } from '@/hooks/use-assistant-conversation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import type { AppLocale } from '@/i18n/routing'
import type { NodeAssistantNodeContext } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import { AssistantConversation } from './AssistantConversation'
import {
  CanvasAssistantRouteSelector,
  type NodeAssistantRouteSelection,
} from './CanvasAssistantRouteSelector'
import { ScriptDocWorkspace } from './ScriptDocWorkspace'

interface StudioNodeAssistantDockProps {
  open: boolean
  expanded: boolean
  projectName: string
  nodes: NodeWorkflowNode[]
  scriptDoc: ScriptDoc | undefined
  locale: AppLocale
  onOpenChange(open: boolean): void
  onExpandedChange(expanded: boolean): void
  onFocusNode(nodeId: string): void
}

interface DockLayout {
  widthPx: number
}

const DEFAULT_DOCK_LAYOUT: DockLayout = {
  widthPx: NODE_STUDIO_DOCK_RESIZE.defaultWidthPx,
}

let storedLayout: DockLayout | null = null
const layoutListeners = new Set<() => void>()

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

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function readWidthPx(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('widthPx' in value)) {
    return undefined
  }
  const candidate = value as { widthPx?: unknown }
  return typeof candidate.widthPx === 'number' ? candidate.widthPx : undefined
}

function readStoredDockLayout(): DockLayout {
  if (typeof window === 'undefined') {
    return DEFAULT_DOCK_LAYOUT
  }

  try {
    const raw = window.localStorage.getItem(NODE_STUDIO_DOCK_RESIZE.storageKey)
    if (!raw) return DEFAULT_DOCK_LAYOUT
    const widthPx = readWidthPx(JSON.parse(raw))
    return {
      widthPx: clamp(
        widthPx ?? NODE_STUDIO_DOCK_RESIZE.defaultWidthPx,
        NODE_STUDIO_DOCK_RESIZE.minWidthPx,
        NODE_STUDIO_DOCK_RESIZE.maxWidthPx,
      ),
    }
  } catch {
    return DEFAULT_DOCK_LAYOUT
  }
}

function getLayoutSnapshot(): DockLayout {
  if (!storedLayout) {
    storedLayout = readStoredDockLayout()
  }
  return storedLayout
}

function getServerLayoutSnapshot(): DockLayout {
  return DEFAULT_DOCK_LAYOUT
}

function subscribeLayout(listener: () => void): () => void {
  layoutListeners.add(listener)
  return () => {
    layoutListeners.delete(listener)
  }
}

function setStoredLayout(updater: (prev: DockLayout) => DockLayout): void {
  const next = updater(getLayoutSnapshot())
  if (storedLayout && storedLayout.widthPx === next.widthPx) {
    return
  }

  storedLayout = next
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        NODE_STUDIO_DOCK_RESIZE.storageKey,
        JSON.stringify(next),
      )
    } catch {
      // Session-only fallback is acceptable for a UI preference.
    }
  }
  for (const listener of layoutListeners) {
    listener()
  }
}

function useDockLayout() {
  const layout = useSyncExternalStore(
    subscribeLayout,
    getLayoutSnapshot,
    getServerLayoutSnapshot,
  )
  const [isResizing, setIsResizing] = useState(false)
  const widthDragRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  const setWidth = useCallback((next: number) => {
    setStoredLayout((prev) => ({
      ...prev,
      widthPx: clamp(
        next,
        NODE_STUDIO_DOCK_RESIZE.minWidthPx,
        NODE_STUDIO_DOCK_RESIZE.maxWidthPx,
      ),
    }))
  }, [])

  const handleWidthPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsResizing(true)
      widthDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: layout.widthPx,
      }
    },
    [layout.widthPx, widthDragRef],
  )

  const handleWidthPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = widthDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      setWidth(drag.startWidth + (drag.startX - event.clientX))
    },
    [setWidth, widthDragRef],
  )

  const handleWidthPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (widthDragRef.current?.pointerId === event.pointerId) {
        widthDragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setIsResizing(false)
    },
    [widthDragRef],
  )

  const handleWidthKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setWidth(layout.widthPx + NODE_STUDIO_DOCK_RESIZE.widthStepPx)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setWidth(layout.widthPx - NODE_STUDIO_DOCK_RESIZE.widthStepPx)
      } else if (event.key === 'Home') {
        event.preventDefault()
        setWidth(NODE_STUDIO_DOCK_RESIZE.maxWidthPx)
      } else if (event.key === 'End') {
        event.preventDefault()
        setWidth(NODE_STUDIO_DOCK_RESIZE.minWidthPx)
      }
    },
    [layout.widthPx, setWidth],
  )

  return {
    layout,
    isResizing,
    widthHandlers: {
      onPointerDown: handleWidthPointerDown,
      onPointerMove: handleWidthPointerMove,
      onPointerUp: handleWidthPointerUp,
      onPointerCancel: handleWidthPointerUp,
      onKeyDown: handleWidthKeyDown,
    },
  }
}

export function StudioNodeAssistantDock({
  open,
  expanded,
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
  const tNodeTypes = useTranslations('StudioNode.nodeTypes')
  const selection = useNodeSelection()
  const conversation = useAssistantConversation()
  const [assistantRoute, setAssistantRoute] =
    useState<NodeAssistantRouteSelection>({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    })
  const { layout, isResizing, widthHandlers } = useDockLayout()
  const isMobile = useIsMobile()

  const dockStyle = useMemo<CSSProperties>(
    () =>
      isMobile
        ? {}
        : expanded
          ? {
              width: `${NODE_STUDIO_DOCK_RESIZE.expandedWidthPx}px`,
              maxWidth: 'calc(100vw - 6rem)',
            }
          : { width: `${layout.widthPx}px` },
    [expanded, isMobile, layout.widthPx],
  )

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

  const dockStarters = useMemo(
    () => [
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
    ],
    [t],
  )

  // The opener line must reflect canvas state — claiming "still empty" while the
  // user has nodes (or an outline) reads as a bug. Switch to an active opener
  // once there's anything on the canvas.
  const opener =
    nodes.length > 0 || scriptDoc ? t('leanOpenerActive') : t('leanOpener')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label={tAssistant('toggle')}
        title={tAssistant('toggle')}
        className="pointer-events-auto absolute bottom-24 right-4 inline-flex size-12 items-center justify-center gap-2 rounded-full border border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl transition-colors hover:border-node-edge hover:bg-node-panel-inner md:bottom-auto md:right-6 md:top-24 md:size-auto md:h-10 md:rounded-xl md:px-3 md:text-xs md:font-semibold"
      >
        <Bot className="size-5 text-node-muted md:size-4" />
        <span className="hidden md:inline">{tAssistant('toggle')}</span>
      </button>
    )
  }

  return (
    <aside
      style={dockStyle}
      data-resizing={isResizing ? 'true' : undefined}
      className="node-canvas-panel-motion pointer-events-auto absolute inset-x-0 bottom-0 top-auto flex h-[65vh] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl md:inset-x-auto md:bottom-4 md:right-4 md:top-20 md:h-auto md:rounded-2xl md:border-b"
    >
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        aria-label={t('collapse')}
        className="flex h-5 shrink-0 items-center justify-center md:hidden"
      >
        <span
          className="h-1 w-10 rounded-full bg-node-panel-inner"
          aria-hidden
        />
      </button>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('resize.widthLabel')}
        aria-valuemin={NODE_STUDIO_DOCK_RESIZE.minWidthPx}
        aria-valuemax={NODE_STUDIO_DOCK_RESIZE.maxWidthPx}
        aria-valuenow={layout.widthPx}
        tabIndex={0}
        {...widthHandlers}
        title={t('resize.widthLabel')}
        className="group absolute inset-y-0 left-0 z-10 hidden w-2.5 cursor-col-resize items-center justify-center focus:outline-none md:flex"
      >
        <span className="flex h-14 w-1.5 items-center justify-center rounded-full bg-node-panel-inner/80 text-node-muted transition-colors group-hover:bg-node-edge group-hover:text-node-canvas group-focus-visible:bg-node-edge-active group-focus-visible:text-node-canvas">
          <GripVertical className="size-3" />
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-node-panel-inner px-3 py-2.5 md:px-4 md:py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-node-foreground">
            {projectName}
          </p>
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('title')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 md:gap-1">
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
            aria-label={expanded ? t('restore') : t('expand')}
            onClick={() => onExpandedChange(!expanded)}
            className="hidden rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground md:inline-flex"
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
          />
        </div>
      )}
    </aside>
  )
}
