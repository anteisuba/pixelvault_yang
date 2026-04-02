'use client'

import { memo } from 'react'
import { ChevronDown, Gift } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { ModelSelector } from '@/components/business/ModelSelector'
import { AnimatedCollapse } from '@/components/ui/animated-collapse'
import { cn } from '@/lib/utils'

import { StudioCardSection } from './StudioCardSection'
import { StudioQuickRouteSelector } from './StudioQuickRouteSelector'

export const StudioLeftColumn = memo(function StudioLeftColumn({
  className,
}: {
  className?: string
}) {
  const { state, dispatch } = useStudioForm()
  const tStudio = useTranslations('StudioPage')
  const tV3 = useTranslations('StudioV3')
  const { summary } = useUsageSummary()
  const { modelOptions, selectedModel } = useImageModelOptions()
  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  return (
    <div className={cn('flex flex-col space-y-4', className)}>
      {state.workflowMode === 'quick' && <StudioQuickRouteSelector />}

      {/* ── Quick mode: Collapsible model selector ──────────────── */}
      {state.workflowMode === 'quick' && (
        <div className="rounded-xl border border-border/40">
          <button
            type="button"
            aria-expanded={state.panels.modelSelector}
            onClick={() =>
              dispatch({ type: 'TOGGLE_PANEL', payload: 'modelSelector' })
            }
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors rounded-xl"
          >
            <span className="font-display truncate">
              {selectedModel ? selectedModel.modelId : tV3('selectModel')}
            </span>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-300 shrink-0 ml-2',
                state.panels.modelSelector && 'rotate-180',
              )}
            />
          </button>
          <AnimatedCollapse open={state.panels.modelSelector}>
            <div className="border-t border-border/40 px-2 py-3">
              <ModelSelector
                value={state.selectedOptionId ?? ''}
                onChange={(optionId) => {
                  dispatch({ type: 'SET_OPTION_ID', payload: optionId })
                  dispatch({ type: 'CLOSE_PANEL', payload: 'modelSelector' })
                }}
                options={modelOptions}
              />
            </div>
          </AnimatedCollapse>
        </div>
      )}

      {/* ── Card mode: dropdowns + API keys + card management ───── */}
      {state.workflowMode === 'card' && <StudioCardSection />}

      {/* ── Free credits ─────────────────────────────────────────── */}
      <div className="mt-auto pt-4">
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
    </div>
  )
})
