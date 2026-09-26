'use client'

import { PanelsTopLeft } from '@/components/icons'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

import { StudioCardPicker } from './StudioCardPicker'
import {
  StudioChipBadge,
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  useStudioChipClasses,
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
  const chip = useStudioChipClasses()
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
            chip.trigger,
            chip.compact,
            chip.look === 'outline' && selectedCardCount > 0 && chip.set,
            open && chip.open,
          )}
        >
          <PanelsTopLeft className="size-4" />
          {chip.look === 'outline' ? (
            <>
              <span className={chip.compactLabel}>{t('cards')}</span>
              {selectedCardCount > 0 ? (
                <span className="tabular-nums">{selectedCardCount}</span>
              ) : null}
            </>
          ) : (
            <>
              <span className="hidden sm:inline">{t('cards')}</span>
              {selectedCardCount > 0 ? (
                <StudioChipBadge>{selectedCardCount}</StudioChipBadge>
              ) : null}
            </>
          )}
        </Toolbar.Button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="medium"
        side="top"
        align={chip.popoverAlign}
        sideOffset={chip.popoverSideOffset}
        label={t('cards')}
      >
        <StudioCardPicker />
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
