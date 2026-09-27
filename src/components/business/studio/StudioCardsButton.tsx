'use client'

import { UserRound } from '@/components/icons'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

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
 * StudioCardsButton — toolbar popover hosting StudioCardPicker（「角色」，owner 09-27）.
 * Same unify-with-other-popovers reasoning as StudioEnhanceButton.
 */
export function StudioCardsButton({ disabled }: StudioCardsButtonProps) {
  const { state, dispatch } = useStudioForm()
  const { characters } = useStudioData()
  const t = useTranslations('StudioV2')
  const chip = useStudioChipClasses()
  const open = state.panels.cardSelector
  // 只剩角色（owner 09-27：画风卡 · 背景卡 · 内置风格下线）。
  const selectedCardCount = characters.activeCardIds.length

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
          aria-label={t('characters')}
          className={cn(
            chip.trigger,
            chip.compact,
            chip.look === 'outline' && selectedCardCount > 0 && chip.set,
            open && chip.open,
          )}
        >
          <UserRound className="size-4" />
          {chip.look === 'outline' ? (
            <>
              <span className={chip.compactLabel}>{t('characters')}</span>
              {selectedCardCount > 0 ? (
                <span className="tabular-nums">{selectedCardCount}</span>
              ) : null}
            </>
          ) : (
            <>
              <span className="hidden sm:inline">{t('characters')}</span>
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
        label={t('characters')}
      >
        <StudioCardPicker />
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
