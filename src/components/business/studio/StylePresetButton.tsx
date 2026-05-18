'use client'

import { Palette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useStudioForm } from '@/contexts/studio-context'
import { STYLE_PRESETS, NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import { cn } from '@/lib/utils'

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

  const activePreset = STYLE_PRESETS.find((p) => p.id === state.stylePresetId)
  const isActive = state.stylePresetId !== NO_STYLE_PRESET_ID
  const buttonLabel = activePreset
    ? `${activePreset.icon} ${t(activePreset.messageKey)}`
    : t('label')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('label')}
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
            isActive && 'bg-muted/30 text-primary',
          )}
        >
          <Palette className="size-4 shrink-0" />
          <span className="hidden truncate sm:inline">{buttonLabel}</span>
        </Toolbar.Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3"
        side="top"
        align="center"
        sideOffset={12}
      >
        <div className="mb-2 text-2xs font-medium text-muted-foreground/70">
          {t('label')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'SET_STYLE_PRESET',
                payload: NO_STYLE_PRESET_ID,
              })
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-all duration-200',
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
              onClick={() =>
                dispatch({ type: 'SET_STYLE_PRESET', payload: preset.id })
              }
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-all duration-200',
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
      </PopoverContent>
    </Popover>
  )
}
