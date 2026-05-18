'use client'

import { memo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

import { StudioAdvancedDrawer } from './StudioAdvancedDrawer'

/**
 * StudioTopBar — Slim 48px bar: advanced path entry.
 *
 * The free-quota chip was relocated to the sidebar footer (Krea-style: a thin
 * progress bar + remaining/limit under the credits badge). Keeping it here in
 * a bright Gift icon made the dark workspace top-right too noisy — the
 * sidebar already houses every other persistent account-level indicator
 * (credits, locale, avatar), so quota belongs there.
 */
export const StudioTopBar = memo(function StudioTopBar() {
  const tAdvanced = useTranslations('StudioAdvanced')
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
      </div>
      <StudioAdvancedDrawer
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
      />
    </>
  )
})
