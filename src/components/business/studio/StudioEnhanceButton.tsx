'use client'

import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import { useStudioData } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { useStudioAssistantPanelInputs } from '@/hooks/use-studio-assistant-panel-inputs'
import { cn } from '@/lib/utils'
import {
  studioChipActiveClass,
  studioDialogBaseClass,
  StudioPanelHeader,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Spinner size="lg" className="text-muted-foreground" />
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

// ─── Chunk prefetch ────────────────────────────────────────────────
// Warms the panel's dynamic chunk on hover/focus intent so the first open
// shows the panel instantly instead of the loading fallback (the open
// transition itself is handled by StudioAssistantDock's width animation —
// this only removes the chunk-download stall inside it). Idempotent: the
// bundler caches the import promise, so repeat calls are free.
// 施工基准：docs/plans/assistant-ux-batch-2026-07.md Slice B.
let promptAssistantPanelPrefetched = false
function prefetchPromptAssistantPanel() {
  if (promptAssistantPanelPrefetched) return
  promptAssistantPanelPrefetched = true
  void import('@/components/business/prompts/PromptAssistantPanel')
}

interface StudioEnhanceButtonProps {
  disabled?: boolean
}

/**
 * StudioEnhanceButton — the toolbar "助手" chip. Since 2026-07-07 it has two
 * hosts behind one `panels.enhance` state:
 *  - desktop (≥lg): plain open/close toggle for the persistent right-side
 *    StudioAssistantDock (mounted by StudioWorkspaceUI) — no dialog here.
 *  - mobile (<lg): keeps the ResponsiveDialog drawer host, since a side dock
 *    doesn't fit narrow viewports.
 * 施工基准：docs/design/reviews/2026-07-07-studio-assistant-dock-redesign.md
 */
export function StudioEnhanceButton({ disabled }: StudioEnhanceButtonProps) {
  const t = useTranslations('StudioV2')
  const isMobile = useIsMobile()
  const { promptEnhance } = useStudioData()
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

  const isEnhancing = promptEnhance.isEnhancing

  // Idle-time fallback prefetch — covers touch/keyboard entry that never
  // fires a hover/focus event before the first tap.
  useEffect(() => {
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(
        prefetchPromptAssistantPanel,
      )
      return () => idleWindow.cancelIdleCallback?.(handle)
    }
    const timeout = window.setTimeout(prefetchPromptAssistantPanel, 2000)
    return () => window.clearTimeout(timeout)
  }, [])

  const triggerButton = (
    <Toolbar.Button
      type="button"
      disabled={disabled || isEnhancing}
      aria-label={t('enhance')}
      aria-pressed={open}
      onClick={isMobile ? undefined : () => setOpen(!open)}
      onMouseEnter={prefetchPromptAssistantPanel}
      onFocus={prefetchPromptAssistantPanel}
      className={cn(studioToolTriggerClass, open && studioChipActiveClass)}
    >
      <Sparkles className={cn('size-4', isEnhancing && 'animate-pulse')} />
      <span className="hidden sm:inline">{t('enhance')}</span>
    </Toolbar.Button>
  )

  // Desktop: the chip only toggles panels.enhance; the dock renders the panel.
  if (!isMobile) {
    return triggerButton
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>{triggerButton}</ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        className={cn(
          studioDialogBaseClass,
          'max-h-[min(86svh,720px)] w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] sm:w-[min(860px,calc(100vw-4rem))] sm:!max-w-[860px]',
        )}
        mobileBodyClassName="overflow-hidden px-3 pb-3 pt-1"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* 可见头部 — 与 StudioDockPanelArea 的 Dialog 型面板同规范（决议 5 契约） */}
        <StudioPanelHeader
          icon={<Sparkles className="size-3.5 text-primary" />}
        >
          {t('enhance')}
        </StudioPanelHeader>
        <ResponsiveDialogDescription className="sr-only">
          {t('enhance')}
        </ResponsiveDialogDescription>
        <div className="flex h-[min(70svh,640px)] min-h-[360px] flex-col overflow-hidden px-1 pb-1 pt-2 sm:h-[min(680px,75vh)] sm:px-5 sm:pb-5 sm:pt-3">
          <PromptAssistantPanel
            currentPrompt={currentPrompt}
            modelId={modelId}
            referenceImageData={referenceImageData}
            llmApiKeys={llmApiKeys}
            onUsePrompt={onUsePrompt}
            onAppendPrompt={onAppendPrompt}
            onClose={() => setOpen(false)}
          />
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
