'use client'

import { memo } from 'react'
import { ImageIcon, Film, Gift, PanelLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useSidebar } from '@/components/ui/sidebar'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { getProviderLabel } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

/**
 * StudioTopBar — Slim 44px bar: sidebar toggle + mode toggle + route indicator + credits.
 */
export const StudioTopBar = memo(function StudioTopBar() {
  const { state, dispatch } = useStudioForm()
  const tStudio = useTranslations('StudioPage')
  const tV3 = useTranslations('StudioV3')
  const tModels = useTranslations('Models')
  const { summary } = useUsageSummary()
  const { toggleSidebar } = useSidebar()
  const { selectedModel } = useImageModelOptions()
  const { healthMap } = useApiKeysContext()

  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  // Active route indicator
  const routeHealth = selectedModel?.keyId
    ? healthMap[selectedModel.keyId]
    : undefined
  const routeLabel = selectedModel
    ? (selectedModel.keyLabel ??
      getTranslatedModelLabel(tModels, selectedModel.modelId))
    : null
  const routeProvider = selectedModel
    ? getProviderLabel(selectedModel.providerConfig)
    : null

  return (
    <div className="flex h-12 items-center gap-3 border-b border-border/60 px-4 shrink-0 font-display">
      {/* Sidebar toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(
          'flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-all duration-200',
          'hover:border-primary/30 hover:text-foreground',
        )}
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="size-4.5" />
      </button>

      {/* Image / Video toggle */}
      <div
        role="tablist"
        aria-label={tStudio('modeLabel')}
        className="flex rounded-lg border border-border/60 p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={state.outputType === 'image'}
          onClick={() =>
            dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'image' })
          }
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
            state.outputType === 'image'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          <ImageIcon className="size-4" />
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
            'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
            state.outputType === 'video'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          <Film className="size-4" />
          {tStudio('modeVideo')}
        </button>
      </div>

      {/* Divider */}
      <div
        className="hidden xl:block h-6 w-px bg-border/60"
        aria-hidden="true"
      />

      {/* Quick / Card workflow toggle */}
      <div
        role="tablist"
        aria-label={tV3('workflowModeLabel')}
        className="flex rounded-lg border border-border/60 p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={state.workflowMode === 'quick'}
          onClick={() =>
            dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
          }
          className={cn(
            'rounded-md px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
            state.workflowMode === 'quick'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {tV3('quickMode')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.workflowMode === 'card'}
          onClick={() =>
            dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'card' })
          }
          className={cn(
            'rounded-md px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
            state.workflowMode === 'card'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {tV3('cardMode')}
        </button>
      </div>

      {/* Active route indicator */}
      {routeLabel && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-1">
          <ApiKeyHealthDot status={routeHealth} />
          <span className="font-medium text-foreground">{routeLabel}</span>
          {routeProvider && <span>{routeProvider}</span>}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Free credits badge */}
      <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-sm text-muted-foreground">
        <Gift className="size-4 text-chart-3" />
        <span className="font-serif font-medium">
          {tStudio('freeQuota', {
            remaining: Math.max(0, freeRemaining),
            limit: summary.freeGenerationLimit,
          })}
        </span>
      </div>
    </div>
  )
})
