'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { ChevronUp, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Drawer as DrawerPrimitive } from 'vaul'

import { LORA_TRAINING } from '@/constants/config'
import { cn } from '@/lib/utils'

export interface MobileTrainingSheetProps {
  /** Form + history content rendered inside the sheet. */
  children: ReactNode
  /** Floating button label override. Defaults to LoraTraining.mobileSheetTrigger. */
  triggerLabel?: string
  className?: string
}

/**
 * Mobile bottom-sheet wrapper for the training form. Desktop never
 * renders this — the page-level layout switches between two-column
 * (md+) and this drawer at the sm breakpoint. The trigger is a fixed
 * FAB at the bottom of the viewport so the user always has a clear
 * way to open the form, even after scrolling through history.
 *
 * Snap points come from LORA_TRAINING.MOBILE_SNAP_POINTS — default to
 * 0.4 (preview the form, the rest of the page still visible) and 0.95
 * (full-height when typing). Drag-down closes via Vaul's gesture; the
 * scrim closes via tap.
 */
export function MobileTrainingSheet({
  children,
  triggerLabel,
  className,
}: MobileTrainingSheetProps) {
  const t = useTranslations('LoraTraining')
  const snapPoints = LORA_TRAINING.MOBILE_SNAP_POINTS
  const [snap, setSnap] = useState<number | string | null>(snapPoints[0] ?? 0.4)

  return (
    <DrawerPrimitive.Root
      snapPoints={[...snapPoints]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      shouldScaleBackground
    >
      <DrawerPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'fixed bottom-4 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-all active:scale-[0.97]',
            className,
          )}
          style={{
            bottom:
              'calc(1rem + var(--keyboard-safe-area-bottom, 0px) + var(--keyboard-inset, 0px))',
          }}
        >
          <Sparkles className="size-4" aria-hidden />
          {triggerLabel ?? t('mobileSheetTrigger')}
          <ChevronUp className="size-4" aria-hidden />
        </button>
      </DrawerPrimitive.Trigger>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DrawerPrimitive.Content
          aria-label={t('mobileSheetAriaLabel')}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[95vh] flex-col rounded-t-2xl border-t border-border bg-card focus:outline-none"
          style={{
            bottom: 'var(--keyboard-inset, 0px)',
            maxHeight: 'calc(100svh - var(--keyboard-inset, 0px) - 0.75rem)',
          }}
        >
          <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
          <div
            className="flex-1 overflow-y-auto px-4 pt-4"
            style={{
              paddingBottom:
                'max(var(--keyboard-safe-area-bottom, 0px), 1.5rem)',
            }}
          >
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}
