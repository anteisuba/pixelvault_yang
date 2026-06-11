'use client'

import { PanelsTopLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

import { StudioCardPicker } from './StudioCardPicker'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioCardsButtonProps {
  disabled?: boolean
}

/**
 * StudioCardsButton — toolbar popover hosting StudioCardPicker.
 * Same unify-with-other-popovers reasoning as StudioEnhanceButton.
 */
export function StudioCardsButton({ disabled }: StudioCardsButtonProps) {
  const { state, dispatch } = useStudioForm()
  const { characters, backgrounds, styles } = useStudioData()
  const t = useTranslations('StudioV2')
  const open = state.panels.cardSelector
  const selectedCardCount =
    characters.activeCardIds.length +
    (backgrounds.activeCardId ? 1 : 0) +
    (styles.activeCardId ? 1 : 0) +
    (state.stylePresetId !== NO_STYLE_PRESET_ID ? 1 : 0)

  return (
    <StudioToolSurface
      open={open}
      onOpenChange={(nextOpen) => {
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'cardSelector',
        })
      }}
    >
      <StudioToolSurfaceTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('cards')}
          className={cn(
            studioToolTriggerClass,
            open && 'bg-muted/30 text-primary',
          )}
        >
          <PanelsTopLeft className="size-4" />
          <span className="hidden sm:inline">{t('cards')}</span>
          {selectedCardCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
              {selectedCardCount}
            </span>
          ) : null}
        </Toolbar.Button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="medium"
        side="top"
        align="center"
        label={t('cards')}
      >
        <StudioCardPicker />
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
