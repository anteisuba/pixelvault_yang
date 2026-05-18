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
}

export const FishVoiceLibraryDialog = memo(function FishVoiceLibraryDialog({
  open,
  onOpenChange,
  sidePanel,
  onVoiceSelectComplete,
}: FishVoiceLibraryDialogProps) {
  const t = useTranslations('StudioPage')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('voiceLibraryClose')}
        className="flex h-[85vh] min-h-0 flex-col !max-w-5xl p-0"
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="font-display text-base">
            {t('voiceLibraryTitle')}
          </DialogTitle>
          <DialogDescription className="max-w-2xl text-xs">
            {t('voiceLibraryDescription')}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'grid min-h-0 flex-1 gap-4 overflow-hidden px-5 pb-5 pt-1',
            sidePanel ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'grid-cols-1',
          )}
        >
          <section className="flex min-h-0 flex-col overflow-hidden">
            <VoiceSelector
              className="h-full"
              onSelectComplete={onVoiceSelectComplete}
            />
          </section>
          {sidePanel ? (
            <aside className="min-h-0 overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-4">
              {sidePanel}
            </aside>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
})
