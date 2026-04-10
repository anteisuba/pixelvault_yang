'use client'

import { memo } from 'react'
import { Gift, ImageIcon, Film, Mic } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { cn } from '@/lib/utils'

export const StudioModeSelector = memo(function StudioModeSelector() {
  const { state, dispatch } = useStudioForm()
  const tStudio = useTranslations('StudioPage')
  const { summary } = useUsageSummary()
  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  return (
    <div className="flex items-center justify-between">
      <div
        role="tablist"
        aria-label={tStudio('modeLabel')}
        className="flex gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={state.outputType === 'image'}
          onClick={() =>
            dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'image' })
          }
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            state.outputType === 'image'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <ImageIcon className="size-3.5" />
          {tStudio('modeImage')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.outputType === 'video'}
          onClick={() =>
            dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
          }
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            state.outputType === 'video'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <Film className="size-3.5" />
          {tStudio('modeVideo')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.outputType === 'audio'}
          onClick={() =>
            dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'audio' })
          }
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            state.outputType === 'audio'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <Mic className="size-3.5" />
          {tStudio('modeAudio')}
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Gift className="size-3.5 text-chart-3" />
        <span className="font-serif">
          {tStudio('freeQuota', {
            remaining: Math.max(0, freeRemaining),
            limit: summary.freeGenerationLimit,
          })}
        </span>
      </div>
    </div>
  )
})
