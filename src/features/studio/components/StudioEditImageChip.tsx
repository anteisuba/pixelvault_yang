'use client'

import { PenTool } from '@/components/icons'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { cn } from '@/lib/utils'

import { useStudioChipClasses } from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioEditImageChipProps {
  disabled?: boolean
  onEdit: () => void
}

/**
 * StudioEditImageChip —「改图」（owner 2026-11-04）：图片台与标签台工具行里进入改图的那一颗。
 *
 * 原来住在台顶「自然语言 · 标签 · 编辑」切换条里；切换条按 ui-spec §1 撤掉后搬来这里，与
 * 「从图读串」同一档。宽度够写字、不够只剩图标（`compactLabel`）。结果图上悬停的「编辑」照旧。
 */
export function StudioEditImageChip({
  disabled,
  onEdit,
}: StudioEditImageChipProps) {
  const t = useTranslations('StudioImageEdit')
  const chip = useStudioChipClasses()

  return (
    <Toolbar.Button
      type="button"
      disabled={disabled}
      aria-label={t('toolChip')}
      onClick={onEdit}
      className={cn(chip.trigger, chip.compact)}
    >
      <PenTool className="size-4" aria-hidden />
      <span className={chip.compactLabel}>{t('toolChip')}</span>
    </Toolbar.Button>
  )
}
