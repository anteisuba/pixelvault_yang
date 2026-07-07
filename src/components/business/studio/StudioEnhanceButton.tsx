'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
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
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
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

  const triggerButton = (
    <Toolbar.Button
      type="button"
      disabled={disabled || isEnhancing}
      aria-label={t('enhance')}
      aria-pressed={open}
      onClick={isMobile ? undefined : () => setOpen(!open)}
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
          'w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:w-[min(860px,calc(100vw-4rem))] sm:!max-w-[860px]',
        )}
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
        <div className="flex h-[min(680px,75vh)] flex-col overflow-hidden px-5 pb-5 pt-3">
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
