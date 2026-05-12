'use client'

import { memo, useState } from 'react'
import { Gift, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useUsageSummary } from '@/hooks/use-usage-summary'
import { cn } from '@/lib/utils'

import { StudioAdvancedDrawer } from './StudioAdvancedDrawer'

/**
 * StudioTopBar — Slim 48px bar: advanced path + free-credit badge.
 *
 * The model/route indicator was removed once the prompt area gained its own
 * model dropdown — duplicating it here just doubled the "which model is
 * active?" surface. The sidebar toggle was already removed in Phase 3.1
 * (the global AppSidebar owns navigation).
 */
export const StudioTopBar = memo(function StudioTopBar() {
  const tStudio = useTranslations('StudioPage')
  const tAdvanced = useTranslations('StudioAdvanced')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { summary } = useUsageSummary()

  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3 font-display sm:gap-3 sm:px-4">
        {/* Spacer — keeps right-aligned controls anchored */}
        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setAdvancedOpen(true)}
          aria-label={tAdvanced('openAriaLabel')}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-xs font-semibold text-muted-foreground transition-all duration-200 sm:px-3 sm:text-sm',
            'hover:border-primary/30 hover:bg-primary/5 hover:text-foreground',
          )}
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">{tAdvanced('button')}</span>
        </button>

        {/* Free credits badge — compact on mobile */}
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-2xs text-muted-foreground sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs">
          <Gift className="size-3.5 text-chart-3 sm:size-4" />
          <span className="font-serif font-medium">
            <span className="hidden sm:inline">
              {tStudio('freeQuota', {
                remaining: Math.max(0, freeRemaining),
                limit: summary.freeGenerationLimit,
              })}
            </span>
            <span className="sm:hidden">
              {Math.max(0, freeRemaining)}/{summary.freeGenerationLimit}
            </span>
          </span>
        </div>
      </div>
      <StudioAdvancedDrawer
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
      />
    </>
  )
})
