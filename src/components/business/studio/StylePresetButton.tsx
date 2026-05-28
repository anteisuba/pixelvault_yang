'use client'

import { Palette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { STYLE_PRESETS, NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StylePresetButtonProps {
  disabled?: boolean
}

/**
 * StylePresetButton — Krea-style chip popover for the 6 quick style
 * presets (anime / realistic / illustration / watercolor / pixel /
 * cyberpunk). Replaces the inline preset chip row that lived above the
 * prompt before Phase 4.1a — same SET_STYLE_PRESET dispatch, same chip
 * visuals, just gated behind a single toolbar button so the dock stays
 * compact. Self-contained (consumes StudioForm context directly) to
 * keep StudioToolbar's prop surface unchanged.
 */
export function StylePresetButton({ disabled }: StylePresetButtonProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StylePresets')
  const open = state.panels.stylePreset

  const activePreset = STYLE_PRESETS.find((p) => p.id === state.stylePresetId)
  const isActive = state.stylePresetId !== NO_STYLE_PRESET_ID
  const buttonLabel = activePreset
    ? `${activePreset.icon} ${t(activePreset.messageKey)}`
    : t('label')

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'stylePreset',
        })
      }
    >
      <PopoverTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('label')}
          className={cn(
            studioToolTriggerClass,
            (isActive || open) && 'bg-muted/30 text-primary',
          )}
        >
          <Palette className="size-4 shrink-0" />
          <span className="hidden truncate sm:inline">{buttonLabel}</span>
        </Toolbar.Button>
      </PopoverTrigger>
      <StudioToolPopoverContent size="small" side="top" align="center">
        <div className="mb-2 text-2xs font-medium text-muted-foreground/70">
          {t('label')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              dispatch({
                type: 'SET_STYLE_PRESET',
                payload: NO_STYLE_PRESET_ID,
              })
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors duration-150',
              state.stylePresetId === NO_STYLE_PRESET_ID
                ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted',
            )}
          >
            {t('none')}
          </button>
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                dispatch({ type: 'SET_STYLE_PRESET', payload: preset.id })
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors duration-150',
                state.stylePresetId === preset.id
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              <span>{preset.icon}</span>
              <span>{t(preset.messageKey)}</span>
            </button>
          ))}
        </div>
      </StudioToolPopoverContent>
    </Popover>
  )
}
