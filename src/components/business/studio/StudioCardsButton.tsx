'use client'

import { UserRound } from '@/components/icons'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import * as Toolbar from '@radix-ui/react-toolbar'

import { studioLibraryPickPath } from '@/constants/studio-shell'
import { useStudioData } from '@/contexts/studio-context'
import { useLibraryPickSlot } from '@/contexts/studio-library-pick'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import { StudioCardPicker } from './StudioCardPicker'
import {
  StudioChipBadge,
  useStudioChipClasses,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { StudioLibraryPickFrame } from '@/components/business/studio/shell/StudioLibraryPickFrame'

interface StudioCardsButtonProps {
  disabled?: boolean
}

/**
 * StudioCardsButton —「角色」（owner 09-27）。
 *
 * ⭐ 第 9f 步 9f-2d：⛔ 再在台上开弹层（规矩 3「台上不放浮层」）—— 点一下打开外壳中间的
 *   库叠层「角色」一类（`/library/cards?pick=1`），台把那份 `StudioCardPicker` 传送进库那一格：
 *   挑图、造型、张数上限照旧，挑了当场落在台上。底部输入框里可能挂两颗（两种排法），
 *   后挂的那一颗说了算，⛔ 传送两份。
 */
export function StudioCardsButton({ disabled }: StudioCardsButtonProps) {
  const { characters } = useStudioData()
  const t = useTranslations('StudioV2')
  const tTools = useTranslations('StudioTools')
  const router = useRouter()
  const chip = useStudioChipClasses()
  const benchLabel = tTools('tools.image.label')
  const slot = useLibraryPickSlot('cards', benchLabel)
  const open = slot !== null
  // 只剩角色（owner 09-27：画风卡 · 背景卡 · 内置风格下线）。
  const selectedCardCount = characters.activeCardIds.length

  return (
    <>
      <Toolbar.Button
        type="button"
        disabled={disabled}
        aria-label={t('characters')}
        aria-pressed={open}
        onClick={() => {
          if (!open) router.push(studioLibraryPickPath('cards'))
        }}
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
      {slot
        ? createPortal(
            <StudioLibraryPickFrame benchLabel={benchLabel}>
              <StudioCardPicker />
            </StudioLibraryPickFrame>,
            slot,
            'studio-card-picker',
          )
        : null}
    </>
  )
}
