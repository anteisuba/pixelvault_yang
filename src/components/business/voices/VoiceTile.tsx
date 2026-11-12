'use client'

import { useTranslations } from 'next-intl'

import { ImagePlus, Pencil, Trash2, UserRound } from '@/components/icons'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

/** 我的音色那颗「…」里的几样（改名 / 换头像 / 绑到角色 / 删除）：库格子与挑选框共用。 */
export interface VoiceTileActions {
  onRename(): void
  /** null = 绑着角色，头像用的是角色的，这里不给换。 */
  onChangeCover: (() => void) | null
  onBind(): void
  onDelete(): void
}

/** 我的音色那几样：改名 · 换头像 · 绑到角色 · 删除（库骨架的「更多」菜单也用这一份）。 */
export function VoiceTileMenuItems({ actions }: { actions: VoiceTileActions }) {
  const t = useTranslations('VoicesPage')
  return (
    <>
      <DropdownMenuItem onSelect={actions.onRename}>
        <Pencil aria-hidden />
        {t('rename')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!actions.onChangeCover}
        onSelect={() => actions.onChangeCover?.()}
      >
        <ImagePlus aria-hidden />
        {actions.onChangeCover ? t('changeCover') : t('coverFromCharacter')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={actions.onBind}>
        <UserRound aria-hidden />
        {t('bind')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={actions.onDelete}>
        <Trash2 aria-hidden />
        {t('delete')}
      </DropdownMenuItem>
    </>
  )
}
