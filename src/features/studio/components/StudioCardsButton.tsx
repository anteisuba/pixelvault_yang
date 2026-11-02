'use client'

import { UserRound } from '@/components/icons'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { useStudioData } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

import {
  StudioChipBadge,
  useStudioChipClasses,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioCardsButtonProps {
  disabled?: boolean
  /** 舞台上那块「角色」面板开着没有；开合由宿主 `StudioWorkspaceUI` 持有。 */
  open: boolean
  onToggle: () => void
}

/**
 * StudioCardsButton —「角色」（owner 09-27）。
 *
 * ⭐ 10-25 用户定：点一下把舞台出图那块换成角色挑选（`StudioCardsStagePanel`，与模板同一套
 *   换场），挑了当场落在台上，「返回结果」收回；⛔ 再跳去库（原来的 `?pick=1` 传送已删）。
 */
export function StudioCardsButton({
  disabled,
  open,
  onToggle,
}: StudioCardsButtonProps) {
  const { characters } = useStudioData()
  const t = useTranslations('StudioV2')
  const chip = useStudioChipClasses()
  // 只剩角色（owner 09-27：画风卡 · 背景卡 · 内置风格下线）。
  const selectedCardCount = characters.activeCardIds.length

  return (
    <Toolbar.Button
      type="button"
      disabled={disabled}
      aria-label={t('characters')}
      aria-pressed={open}
      onClick={onToggle}
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
  )
}
