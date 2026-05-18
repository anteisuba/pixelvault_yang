'use client'

import { PanelsTopLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

import { StudioCardPicker } from './StudioCardPicker'

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
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'cardSelector',
        })
      }
    >
      <PopoverTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('cards')}
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
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
      <PopoverContent
        side="top"
        align="center"
        sideOffset={12}
        className="w-[min(640px,calc(100vw-2rem))] !p-0 overflow-hidden"
      >
        <StudioCardPicker />
      </PopoverContent>
    </Popover>
  )
}
