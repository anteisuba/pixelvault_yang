'use client'

import { Maximize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioResolutionPopoverProps {
  disabled?: boolean
}

type ResolutionValue = NonNullable<AdvancedParams['resolution']>
type QualityValue = NonNullable<AdvancedParams['quality']>

function isResolutionValue(value: string): value is ResolutionValue {
  return value === 'auto' || value === '1K' || value === '2K' || value === '4K'
}

function isQualityValue(value: string): value is QualityValue {
  return (
    value === 'auto' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high'
  )
}

/**
 * StudioResolutionPopover — image-only chip exposing per-model resolution
 * (1K/2K/4K) and render-quality (low/medium/high) tiers. Both segments are
 * driven entirely by ADAPTER_CAPABILITIES / MODEL_CAPABILITY_OVERRIDES
 * (constants/provider-capabilities.ts) — mirrors StudioAspectRatioPopover's
 * "no options → render nothing" contract, so a model with neither
 * capability leaves the toolbar at 4 chips.
 *
 * Deliberately leaves `advancedParams.resolution` unset until the user
 * picks a tier: the worker only overrides a provider's existing size
 * logic when `resolution` is present, so an untouched chip changes
 * nothing about today's output.
 */
export function StudioResolutionPopover({
  disabled,
}: StudioResolutionPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useImageModelOptions()
  const t = useTranslations('StudioV2')
  const tAdv = useTranslations('AdvancedSettings')

  const config = selectedModel
    ? getCapabilityConfig(selectedModel.adapterType, selectedModel.modelId)
    : null
  const resolutionOptions = config?.resolutionOptions ?? []
  const qualityOptions = config?.qualityOptions ?? []

  if (resolutionOptions.length === 0 && qualityOptions.length === 0) {
    return null
  }

  const open = state.panels.resolution
  const resolution = state.advancedParams.resolution ?? 'auto'
  const quality = state.advancedParams.quality ?? 'auto'

  const setResolution = (value: ResolutionValue) => {
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, resolution: value },
    })
  }
  const setQuality = (value: QualityValue) => {
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, quality: value },
    })
  }

  const triggerLabel = [
    resolutionOptions.includes(resolution)
      ? t(`resolutionOption.${resolution}`)
      : null,
    qualityOptions.includes(quality) ? tAdv(`qualityOption.${quality}`) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <StudioToolSurface
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'resolution',
        })
      }
    >
      <StudioToolSurfaceTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('resolutionQualityLabel')}
          className={cn(studioToolTriggerClass, open && studioChipActiveClass)}
        >
          <Maximize2 className="size-4 shrink-0" />
          {triggerLabel && (
            <span className="hidden sm:inline">{triggerLabel}</span>
          )}
        </Toolbar.Button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="small"
        className="w-auto"
        side="top"
        align="center"
        label={t('resolutionQualityLabel')}
      >
        <div className="flex flex-col gap-3">
          {resolutionOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-medium text-muted-foreground/70">
                {t('resolutionLabel')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {resolutionOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={resolution === value}
                    onClick={() => {
                      if (isResolutionValue(value)) setResolution(value)
                    }}
                    className={cn(
                      'inline-flex min-w-14 items-center justify-center rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                      resolution === value
                        ? studioChipActiveClass
                        : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {t(`resolutionOption.${value}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {qualityOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-medium text-muted-foreground/70">
                {tAdv('quality')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {qualityOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={quality === value}
                    onClick={() => {
                      if (isQualityValue(value)) setQuality(value)
                    }}
                    className={cn(
                      'inline-flex min-w-14 items-center justify-center rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                      quality === value
                        ? studioChipActiveClass
                        : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {tAdv(`qualityOption.${value}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
