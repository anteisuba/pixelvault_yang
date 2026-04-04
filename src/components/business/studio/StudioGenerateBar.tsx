'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_IMAGE_ASPECT_RATIOS } from '@/constants/studio'
import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

/**
 * StudioGenerateBar — Now only contains aspect ratio pills.
 * Generate button has moved into StudioPromptArea.
 */
export const StudioGenerateBar = memo(function StudioGenerateBar() {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-2xs font-medium text-muted-foreground mr-1 hidden sm:inline">
        {t('aspectRatioLabel')}
      </span>
      {STUDIO_IMAGE_ASPECT_RATIOS.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={state.aspectRatio === r}
          onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', payload: r })}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
            'hover:scale-[1.03] active:scale-[0.95]',
            state.aspectRatio === r
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/15'
              : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
          )}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {r}
        </button>
      ))}
    </div>
  )
})
