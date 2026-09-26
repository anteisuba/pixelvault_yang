'use client'

import * as Toolbar from '@radix-ui/react-toolbar'
import { useTranslations } from 'next-intl'

import { FileText } from '@/components/icons'
import { STUDIO_TEMPLATES_PANEL_ID } from '@/constants/studio'
import { useStudioChipClasses } from '@/components/business/studio-shared/primitives/tool-surface'
import { cn } from '@/lib/utils'

/**
 * 工具行那颗「模板」：点一下在舞台上打开模板面板，再点一下收起（owner 2026-09-26
 * 模板 C）。⛔ 不再是弹窗。
 */
export function StudioTemplatesChip({
  open,
  onToggle,
  disabled,
}: {
  open: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const t = useTranslations('PromptLibrary')
  const chip = useStudioChipClasses()
  return (
    <Toolbar.Button
      type="button"
      disabled={disabled}
      aria-expanded={open}
      aria-controls={open ? STUDIO_TEMPLATES_PANEL_ID : undefined}
      onClick={onToggle}
      className={cn(chip.trigger, chip.compact, open && chip.open)}
    >
      <FileText className="size-4" aria-hidden />
      <span className={chip.compactLabel}>{t('templatePicker')}</span>
    </Toolbar.Button>
  )
}
