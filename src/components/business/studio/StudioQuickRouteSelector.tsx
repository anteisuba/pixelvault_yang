'use client'

import { memo, useMemo, useState } from 'react'
import { ChevronDown, KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { Button } from '@/components/ui/button'
import { AnimatedCollapse } from '@/components/ui/animated-collapse'
import { getProviderLabel } from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

import { StudioApiRoutesSection } from './StudioApiRoutesSection'

interface StudioQuickRouteSelectorProps {
  className?: string
  managementMode?: 'drawer' | 'inline'
}

export const StudioQuickRouteSelector = memo(function StudioQuickRouteSelector({
  className,
  managementMode = 'drawer',
}: StudioQuickRouteSelectorProps) {
  const { state, dispatch } = useStudioForm()
  const { keys, healthMap, isLoading } = useApiKeysContext()
  const { modelOptions } = useImageModelOptions()
  const tApiKeys = useTranslations('StudioApiKeys')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const tStudio = useTranslations('StudioV2')
  const [isManagerOpen, setIsManagerOpen] = useState(false)

  const activeRouteCount = keys.filter((key) => key.isActive).length
  const savedOptions = useMemo(
    () => modelOptions.filter((option) => option.sourceType === 'saved'),
    [modelOptions],
  )

  return (
    <section
      className={cn(
        'space-y-3 rounded-xl border border-border/40 bg-background/30 p-3',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {tApiKeys('triggerLabel')}
            </p>
            <p className="text-2xs text-muted-foreground/70">
              {isLoading
                ? tApiKeys('triggerLoading')
                : tApiKeys('triggerCount', { count: activeRouteCount })}
            </p>
          </div>
        </div>

        {managementMode === 'inline' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={isManagerOpen}
            onClick={() => setIsManagerOpen((value) => !value)}
            className="h-8 gap-1.5 rounded-full px-3 text-xs"
          >
            {tStudio('manage')}
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform',
                isManagerOpen && 'rotate-180',
              )}
            />
          </Button>
        ) : (
          <StudioApiRoutesSection compact className="w-auto px-3" />
        )}
      </div>

      {isLoading ? (
        <p className="text-xs font-serif leading-5 text-muted-foreground/70">
          {tApiKeys('loading')}
        </p>
      ) : savedOptions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 bg-background/60 p-3">
          <p className="text-sm font-medium text-foreground">
            {tApiKeys('triggerCount', { count: 0 })}
          </p>
          <p className="mt-1 text-xs font-serif leading-5 text-muted-foreground/70">
            {tApiKeys('sheetDescription')}
          </p>
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label={tApiKeys('triggerLabel')}
          className="grid max-h-72 gap-2 overflow-y-auto pr-1"
        >
          {savedOptions.map((option) => {
            const isSelected = option.optionId === state.selectedOptionId
            const healthStatus = option.keyId
              ? healthMap[option.keyId]
              : undefined
            const modelLabel = getTranslatedModelLabel(tModels, option.modelId)
            const routeTitle = option.keyLabel ?? modelLabel
            const routeMeta = [
              option.keyLabel ? modelLabel : null,
              getProviderLabel(option.providerConfig),
              option.maskedKey ?? null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(' / ')

            return (
              <button
                key={option.optionId}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() =>
                  dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
                }
                className={cn(
                  'rounded-lg border px-3 py-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/50 bg-background/70 hover:border-primary/20 hover:bg-primary/5',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {routeTitle}
                    </p>
                    <p className="mt-1 truncate font-serif text-xs text-muted-foreground">
                      {routeMeta}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {tCommon('creditCount', { count: option.requestCount })}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <ApiKeyHealthDot status={healthStatus} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {managementMode === 'inline' ? (
        <AnimatedCollapse open={isManagerOpen} className="pt-1">
          <div className="rounded-2xl border border-border/50 bg-background/70 p-3">
            <ApiKeyManager />
          </div>
        </AnimatedCollapse>
      ) : null}
    </section>
  )
})
