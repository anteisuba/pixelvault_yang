'use client'

import { PanelsTopLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

import { StudioCardPicker } from './StudioCardPicker'
import {
  StudioToolPopoverContent,
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
    (styles.activeCardId ? 1 : 0)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'cardSelector',
        })
      }}
    >
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <StudioToolPopoverContent size="medium" side="top" align="center">
        <StudioCardPicker />
      </StudioToolPopoverContent>
    </Popover>
  )
}
