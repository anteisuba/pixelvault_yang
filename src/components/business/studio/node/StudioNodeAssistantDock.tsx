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
  GripHorizontal,
  GripVertical,
  MessageSquarePlus,
  PanelRightClose,
  Sparkles,
  Users,
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
import { useNodeSelection } from '@/hooks/use-node-selection'
import type { AppLocale } from '@/i18n/routing'
import type { NodeAssistantNodeContext } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'

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

interface DockLayout {
  widthPx: number
  inspectorRatio: number
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

const DEFAULT_DOCK_LAYOUT: DockLayout = {
  widthPx: NODE_STUDIO_DOCK_RESIZE.defaultWidthPx,
  inspectorRatio: NODE_STUDIO_DOCK_RESIZE.defaultInspectorRatio,
}

/**
 * Module-level layout store backing `useSyncExternalStore`. We deliberately
 * avoid an effect-based read because lint forbids `setState` inside
 * `useEffect`; instead we expose:
 *  - `subscribe(cb)`     — listener registration
 *  - `getSnapshot()`     — client read (localStorage, cached)
 *  - `getServerSnapshot()` — SSR + first-paint default (avoids hydration mismatch)
 *  - `setStoredLayout()` — mutator that persists + notifies
 * The cache (`storedLayout`) keeps `getSnapshot` stable between renders so
 * React's tearing detection stays happy.
 */
let storedLayout: DockLayout | null = null
const layoutListeners = new Set<() => void>()

function readStoredDockLayout(): DockLayout {
  if (typeof window === 'undefined') {
    return DEFAULT_DOCK_LAYOUT
  }
  try {
    const raw = window.localStorage.getItem(NODE_STUDIO_DOCK_RESIZE.storageKey)
    if (!raw) return DEFAULT_DOCK_LAYOUT
    const parsed = JSON.parse(raw) as Partial<DockLayout>
    return {
      widthPx: clamp(
        typeof parsed.widthPx === 'number'
          ? parsed.widthPx
          : NODE_STUDIO_DOCK_RESIZE.defaultWidthPx,
        NODE_STUDIO_DOCK_RESIZE.minWidthPx,
        NODE_STUDIO_DOCK_RESIZE.maxWidthPx,
      ),
      inspectorRatio: clamp(
        typeof parsed.inspectorRatio === 'number'
          ? parsed.inspectorRatio
          : NODE_STUDIO_DOCK_RESIZE.defaultInspectorRatio,
        NODE_STUDIO_DOCK_RESIZE.minInspectorRatio,
        NODE_STUDIO_DOCK_RESIZE.maxInspectorRatio,
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
  // Bail if nothing actually changed — `useSyncExternalStore` re-reads on every
  // listener notify, so emitting unchanged snapshots wastes work.
  if (
    storedLayout &&
    storedLayout.widthPx === next.widthPx &&
    storedLayout.inspectorRatio === next.inspectorRatio
  ) {
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
      // localStorage may be unavailable (private mode, quota). Session-only is
      // an acceptable fallback for a UI preference.
    }
  }
  for (const listener of layoutListeners) {
    listener()
  }
}

/**
 * Owns the dock's draggable width + inspector/assistant vertical split.
 * Persists to localStorage on every change (cheap — just two numbers).
 * Returns pointer + keyboard handlers ready to bind to the two resize
 * handles. Pointer captures avoid losing the drag when the cursor leaves
 * the handle, which matters because the panel is narrow and users often
 * drag past it.
 */
function useDockLayout() {
  const layout = useSyncExternalStore(
    subscribeLayout,
    getLayoutSnapshot,
    getServerLayoutSnapshot,
  )
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const widthDragRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const splitDragRef = useRef<{
    pointerId: number
    containerTop: number
    containerHeight: number
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

  const setInspectorRatio = useCallback((next: number) => {
    setStoredLayout((prev) => ({
      ...prev,
      inspectorRatio: clamp(
        next,
        NODE_STUDIO_DOCK_RESIZE.minInspectorRatio,
        NODE_STUDIO_DOCK_RESIZE.maxInspectorRatio,
      ),
    }))
  }, [])

  const handleWidthPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      widthDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: layout.widthPx,
      }
    },
    [layout.widthPx],
  )

  const handleWidthPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = widthDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      // Dock is anchored to the right edge — dragging the left handle left
      // (decreasing clientX) should grow the panel.
      setWidth(drag.startWidth + (drag.startX - event.clientX))
    },
    [setWidth],
  )

  const handleWidthPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (widthDragRef.current?.pointerId === event.pointerId) {
        widthDragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [],
  )

  const handleWidthKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      // Match the visual orientation: left arrow grows the panel (dock is
      // pinned to the right), right arrow shrinks it.
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

  const handleSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitContainerRef.current
      if (!container) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const rect = container.getBoundingClientRect()
      splitDragRef.current = {
        pointerId: event.pointerId,
        containerTop: rect.top,
        containerHeight: rect.height,
      }
    },
    [],
  )

  const handleSplitPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = splitDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.containerHeight <= 0) return
      const localY = event.clientY - drag.containerTop
      setInspectorRatio(localY / drag.containerHeight)
    },
    [setInspectorRatio],
  )

  const handleSplitPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (splitDragRef.current?.pointerId === event.pointerId) {
        splitDragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [],
  )

  const handleSplitKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setInspectorRatio(
          layout.inspectorRatio - NODE_STUDIO_DOCK_RESIZE.ratioStep,
        )
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setInspectorRatio(
          layout.inspectorRatio + NODE_STUDIO_DOCK_RESIZE.ratioStep,
        )
      } else if (event.key === 'Home') {
        event.preventDefault()
        setInspectorRatio(NODE_STUDIO_DOCK_RESIZE.minInspectorRatio)
      } else if (event.key === 'End') {
        event.preventDefault()
        setInspectorRatio(NODE_STUDIO_DOCK_RESIZE.maxInspectorRatio)
      }
    },
    [layout.inspectorRatio, setInspectorRatio],
  )

  return {
    layout,
    splitContainerRef,
    widthHandlers: {
      onPointerDown: handleWidthPointerDown,
      onPointerMove: handleWidthPointerMove,
      onPointerUp: handleWidthPointerUp,
      onPointerCancel: handleWidthPointerUp,
      onKeyDown: handleWidthKeyDown,
    },
    splitHandlers: {
      onPointerDown: handleSplitPointerDown,
      onPointerMove: handleSplitPointerMove,
      onPointerUp: handleSplitPointerUp,
      onPointerCancel: handleSplitPointerUp,
      onKeyDown: handleSplitKeyDown,
    },
  }
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
  const { layout, splitContainerRef, widthHandlers, splitHandlers } =
    useDockLayout()
  const isMobile = useIsMobile()
  // Mobile uses the bottom-sheet layout (`inset-x-0 h-[65vh]`), so the
  // persisted desktop width would conflict with the full-bleed sheet —
  // skip the inline width when on phone-portrait. The localStorage value
  // is preserved untouched for when the user returns to desktop.
  const dockStyle = useMemo<CSSProperties>(
    () => (isMobile ? {} : { width: `${layout.widthPx}px` }),
    [isMobile, layout.widthPx],
  )
  const inspectorPercent = Math.round(layout.inspectorRatio * 100)
  const assistantPercent = 100 - inspectorPercent

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
        aria-label={tAssistant('toggle')}
        title={tAssistant('toggle')}
        className="pointer-events-auto absolute bottom-24 right-4 inline-flex size-12 items-center justify-center gap-2 rounded-full border border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner md:bottom-auto md:right-6 md:top-24 md:size-auto md:h-10 md:rounded-xl md:px-3 md:text-xs md:font-semibold"
      >
        <Bot className="size-5 text-node-amber md:size-4" />
        <span className="hidden md:inline">{tAssistant('toggle')}</span>
      </button>
    )
  }

  // Mobile: bottom-sheet pattern. The dock anchors to the section bottom and
  // takes ~65vh so the canvas stays visible in the top ~35vh — opening the
  // assistant no longer hides every node on the workflow. The inline
  // `width: 448px` from dockStyle is ignored because `inset-x-0` pins both
  // edges; md+ uses the original right-anchored full-height panel.
  return (
    <aside
      style={dockStyle}
      className="pointer-events-auto absolute inset-x-0 bottom-0 top-auto flex h-[65vh] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl md:inset-x-auto md:bottom-4 md:right-4 md:top-20 md:h-auto md:rounded-2xl md:border-b"
    >
      {/* Grip indicator at the top of the bottom-sheet. Visual affordance
          only — tapping it toggles closed for a quick dismiss. */}
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
      {/* Left-edge handle: drag horizontally to resize the whole dock.
          Hidden on mobile — the dock is full-width and resizing makes
          no sense at that breakpoint. */}
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
        <span className="flex h-14 w-1.5 items-center justify-center rounded-full bg-node-panel-inner/80 text-node-muted transition-colors group-hover:bg-node-amber/70 group-hover:text-node-canvas group-focus-visible:bg-node-amber group-focus-visible:text-node-canvas">
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
            aria-label={t('collapse')}
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </div>

      <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col">
        <div
          style={{ flexBasis: `${inspectorPercent}%` }}
          className="min-h-0 shrink grow overflow-y-auto px-3 py-3 md:px-4 md:py-4"
        >
          <InspectorPanel selection={selection} />
        </div>

        {/* Horizontal handle between Inspector and Assistant conversation. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('resize.splitLabel')}
          aria-valuemin={Math.round(
            NODE_STUDIO_DOCK_RESIZE.minInspectorRatio * 100,
          )}
          aria-valuemax={Math.round(
            NODE_STUDIO_DOCK_RESIZE.maxInspectorRatio * 100,
          )}
          aria-valuenow={inspectorPercent}
          tabIndex={0}
          {...splitHandlers}
          title={t('resize.splitLabel')}
          className="group relative flex h-2.5 shrink-0 cursor-row-resize items-center justify-center border-y border-node-panel-inner bg-node-panel-inner/40 focus:outline-none"
        >
          <span className="flex h-1.5 w-14 items-center justify-center rounded-full bg-node-panel-inner/80 text-node-muted transition-colors group-hover:bg-node-amber/70 group-hover:text-node-canvas group-focus-visible:bg-node-amber group-focus-visible:text-node-canvas">
            <GripHorizontal className="size-3" />
          </span>
        </div>

        <div
          style={{ flexBasis: `${assistantPercent}%` }}
          className="flex min-h-0 shrink grow flex-col"
        >
          <AssistantConversation
            messages={conversation.messages}
            isLoading={conversation.isLoading}
            error={conversation.error}
            onSend={handleSend}
            onRetry={handleRetry}
            onFocusNode={onFocusNode}
            getNodeLabel={getNodeLabel}
          />
        </div>
      </div>
    </aside>
  )
}
