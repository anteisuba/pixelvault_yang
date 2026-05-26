'use client'

import { memo, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { VoiceSelector } from './VoiceSelector'

interface FishVoiceLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sidePanel?: ReactNode
  onVoiceSelectComplete?: () => void
  selectedVoiceId?: string | null
  onSelectVoiceId?: (voiceId: string) => void
}

export const FishVoiceLibraryDialog = memo(function FishVoiceLibraryDialog({
  open,
  onOpenChange,
  sidePanel,
  onVoiceSelectComplete,
  selectedVoiceId,
  onSelectVoiceId,
}: FishVoiceLibraryDialogProps) {
  const t = useTranslations('StudioPage')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('voiceLibraryClose')}
        className="flex h-[100dvh] min-h-0 flex-col !max-w-5xl p-0 sm:h-[85vh]"
      >
        <DialogHeader className="border-b border-border/60 px-4 py-3 sm:px-5 sm:py-4">
          <DialogTitle className="font-display text-base">
            {t('voiceMarket')}
          </DialogTitle>
          <DialogDescription className="max-w-2xl text-xs">
            {t('voiceLibraryDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Mobile (default): explicit `grid-cols-1` + `grid-rows-[minmax(0,1fr)_auto]`
            so the voice list (row 1) grows while the sidePanel (row 2) is
            capped at 45dvh and scrolls internally. Without this, the implicit
            grid track sized both sections to min-content and squashed the
            voice list to ~one row. lg+ restores the side-by-side layout. */}
        <div
          className={cn(
            'grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden px-4 pb-4 pt-1 sm:gap-4 sm:px-5 sm:pb-5',
            sidePanel
              ? 'grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1'
              : null,
          )}
        >
          <section className="flex min-h-0 flex-col overflow-hidden">
            <VoiceSelector
              className="h-full"
              onSelectComplete={onVoiceSelectComplete}
              selectedVoiceId={selectedVoiceId}
              onSelectVoiceId={onSelectVoiceId}
            />
          </section>
          {sidePanel ? (
            <aside className="min-h-0 max-h-[45dvh] overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-3 sm:p-4 lg:max-h-none">
              {sidePanel}
            </aside>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
})
