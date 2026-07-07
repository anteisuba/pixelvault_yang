'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { Bot, GripVertical, ImageDown, PanelRightClose } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'

import {
  STUDIO_ASSISTANT_DOCK_RESIZE,
  STUDIO_REFERENCE_DRAG_TYPE,
} from '@/constants/studio'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useStudioAssistantPanelInputs } from '@/hooks/use-studio-assistant-panel-inputs'
import { readImageFileAsBase64 } from '@/lib/image-input'

const ASSISTANT_DOCK_FILE_MAX_BYTES = 10 * 1024 * 1024

function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" />
    </div>
  )
}

const PromptAssistantPanel = dynamic(
  () =>
    import('@/components/business/prompts/PromptAssistantPanel').then(
      (mod) => mod.PromptAssistantPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

// ─── Width store (localStorage-backed, module-level) ───────────────
// Same pattern as StudioNodeAssistantDock's useDockLayout, driven by the
// independent STUDIO_ASSISTANT_DOCK_RESIZE constants.

interface DockLayout {
  widthPx: number
}

const DEFAULT_DOCK_LAYOUT: DockLayout = {
  widthPx: STUDIO_ASSISTANT_DOCK_RESIZE.defaultWidthPx,
}

let storedLayout: DockLayout | null = null
const layoutListeners = new Set<() => void>()

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function readStoredDockLayout(): DockLayout {
  if (typeof window === 'undefined') {
    return DEFAULT_DOCK_LAYOUT
  }

  try {
    const raw = window.localStorage.getItem(
      STUDIO_ASSISTANT_DOCK_RESIZE.storageKey,
    )
    if (!raw) return DEFAULT_DOCK_LAYOUT
    const parsed = JSON.parse(raw) as { widthPx?: unknown }
    const widthPx =
      typeof parsed?.widthPx === 'number' ? parsed.widthPx : undefined
    return {
      widthPx: clamp(
        widthPx ?? STUDIO_ASSISTANT_DOCK_RESIZE.defaultWidthPx,
        STUDIO_ASSISTANT_DOCK_RESIZE.minWidthPx,
        STUDIO_ASSISTANT_DOCK_RESIZE.maxWidthPx,
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
        STUDIO_ASSISTANT_DOCK_RESIZE.storageKey,
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
        STUDIO_ASSISTANT_DOCK_RESIZE.minWidthPx,
        STUDIO_ASSISTANT_DOCK_RESIZE.maxWidthPx,
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
    [layout.widthPx],
  )

  const handleWidthPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = widthDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
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
      setIsResizing(false)
    },
    [],
  )

  const handleWidthKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setWidth(layout.widthPx + STUDIO_ASSISTANT_DOCK_RESIZE.widthStepPx)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setWidth(layout.widthPx - STUDIO_ASSISTANT_DOCK_RESIZE.widthStepPx)
      } else if (event.key === 'Home') {
        event.preventDefault()
        setWidth(STUDIO_ASSISTANT_DOCK_RESIZE.maxWidthPx)
      } else if (event.key === 'End') {
        event.preventDefault()
        setWidth(STUDIO_ASSISTANT_DOCK_RESIZE.minWidthPx)
      }
    },
    [layout.widthPx, setWidth],
  )

  const resetWidth = useCallback(() => {
    setWidth(STUDIO_ASSISTANT_DOCK_RESIZE.defaultWidthPx)
  }, [setWidth])

  return {
    layout,
    isResizing,
    resetWidth,
    widthHandlers: {
      onPointerDown: handleWidthPointerDown,
      onPointerMove: handleWidthPointerMove,
      onPointerUp: handleWidthPointerUp,
      onPointerCancel: handleWidthPointerUp,
      onKeyDown: handleWidthKeyDown,
    },
  }
}

// ─── Dock ───────────────────────────────────────────────────────────

/**
 * StudioAssistantDock — desktop (≥lg) host for PromptAssistantPanel as a
 * persistent right-side dock, mounted as a horizontal flex sibling of
 * StudioFlowLayout in StudioWorkspaceUI. Mobile keeps the drawer host in
 * StudioEnhanceButton; both share `panels.enhance` as the open state.
 *
 * The whole dock is a drop zone: canvas results ('studio-generation'),
 * prompt-strip thumbnails (STUDIO_REFERENCE_DRAG_TYPE), and OS image files
 * all land in the panel's single reference slot — never in generation.
 *
 * 施工基准：docs/design/reviews/2026-07-07-studio-assistant-dock-redesign.md
 */
export function StudioAssistantDock() {
  const t = useTranslations('PromptAssistant')
  const isMobile = useIsMobile()
  const {
    open,
    setOpen,
    currentPrompt,
    modelId,
    llmApiKeys,
    referenceImageData,
    onUsePrompt,
    onAppendPrompt,
  } = useStudioAssistantPanelInputs()
  const { layout, isResizing, resetWidth, widthHandlers } = useDockLayout()

  const [injectedReference, setInjectedReference] = useState<
    { url: string; token: number } | undefined
  >(undefined)
  const [isDragOver, setIsDragOver] = useState(false)
  const dockRef = useRef<HTMLElement>(null)

  const injectReference = useCallback((url: string) => {
    setInjectedReference((prev) => ({ url, token: (prev?.token ?? 0) + 1 }))
  }, [])

  // Internal drags (Pragmatic DnD): canvas results + prompt-strip thumbnails.
  useEffect(() => {
    const el = dockRef.current
    if (!el || !open || isMobile) return
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) =>
        source.data.type === 'studio-generation' ||
        source.data.type === STUDIO_REFERENCE_DRAG_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false)
        const url = source.data.url
        if (typeof url === 'string' && url) injectReference(url)
      },
    })
  }, [open, isMobile, injectReference])

  // External drags (OS files) use native HTML5 events.
  const handleNativeDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      setIsDragOver(true)
    },
    [],
  )

  const handleNativeDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node)) return
      setIsDragOver(false)
    },
    [],
  )

  const handleNativeDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (event.dataTransfer.files.length === 0) return
      event.preventDefault()
      setIsDragOver(false)
      const file = Array.from(event.dataTransfer.files).find((entry) =>
        entry.type.startsWith('image/'),
      )
      if (!file) return
      void readImageFileAsBase64(file, {
        maxFileSize: ASSISTANT_DOCK_FILE_MAX_BYTES,
      }).then((result) => {
        if (result.ok) injectReference(result.base64)
      })
    },
    [injectReference],
  )

  if (isMobile || !open) return null

  return (
    <aside
      ref={dockRef}
      role="complementary"
      aria-label={t('dockLabel')}
      data-resizing={isResizing ? 'true' : undefined}
      style={{ width: `${layout.widthPx}px` }}
      onDragOver={handleNativeDragOver}
      onDragLeave={handleNativeDragLeave}
      onDrop={handleNativeDrop}
      className="relative hidden shrink-0 border-l border-border/60 bg-background lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('dockResizeLabel')}
        aria-valuemin={STUDIO_ASSISTANT_DOCK_RESIZE.minWidthPx}
        aria-valuemax={STUDIO_ASSISTANT_DOCK_RESIZE.maxWidthPx}
        aria-valuenow={layout.widthPx}
        tabIndex={0}
        {...widthHandlers}
        onDoubleClick={resetWidth}
        title={t('dockResizeLabel')}
        className="group absolute inset-y-0 left-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center focus:outline-none"
      >
        <span className="flex h-14 w-1.5 items-center justify-center rounded-full bg-border/80 text-muted-foreground transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60">
          <GripVertical className="size-3" />
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="size-4 shrink-0 text-primary" />
          <p className="truncate text-sm font-semibold text-foreground">
            {t('dockTitle')}
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('dockCollapse')}
          onClick={() => setOpen(false)}
          className="rounded-xl text-muted-foreground hover:text-foreground"
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
        <PromptAssistantPanel
          currentPrompt={currentPrompt}
          modelId={modelId}
          referenceImageData={referenceImageData}
          llmApiKeys={llmApiKeys}
          onUsePrompt={onUsePrompt}
          onAppendPrompt={onAppendPrompt}
          injectedReference={injectedReference}
        />
      </div>

      {isDragOver ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/10">
          <span className="flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-xs font-medium text-foreground shadow-sm">
            <ImageDown className="size-4 text-primary" />
            {t('dockDropHint')}
          </span>
        </div>
      ) : null}
    </aside>
  )
}
