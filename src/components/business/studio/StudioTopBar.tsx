'use client'

import { memo, useState } from 'react'
import { Gift, PanelLeft, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useSidebar } from '@/components/ui/sidebar'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { getProviderLabel } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

import { StudioAdvancedDrawer } from './StudioAdvancedDrawer'

/**
 * StudioTopBar — Slim 44px bar: sidebar toggle + route indicator + advanced path + credits.
 */
export const StudioTopBar = memo(function StudioTopBar() {
  const { state } = useStudioForm()
  const tStudio = useTranslations('StudioPage')
  const tAdvanced = useTranslations('StudioAdvanced')
  const tModels = useTranslations('Models')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { summary } = useUsageSummary()
  const { toggleSidebar } = useSidebar()
  const { selectedModel: imageModel } = useImageModelOptions()
  const { selectedModel: audioModel } = useAudioModelOptions()
  const selectedModel = state.outputType === 'audio' ? audioModel : imageModel
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
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3 font-display sm:gap-3 sm:px-4">
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

        {/* Active route indicator — hidden on mobile */}
        {routeLabel && (
          <div className="ml-1 hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
            <ApiKeyHealthDot status={routeHealth} />
            <span className="font-medium text-foreground">{routeLabel}</span>
            {routeProvider && <span>{routeProvider}</span>}
          </div>
        )}

        {/* Spacer */}
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
