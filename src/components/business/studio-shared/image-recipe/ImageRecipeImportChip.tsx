'use client'

import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { pickImageRecipeFile } from '@/hooks/use-image-recipe-import'
import { cn } from '@/lib/utils'
import { ScanText } from '@/components/icons'
import {
  studioOutlineChipClass,
  studioOutlineChipCompactClass,
  studioOutlineChipCompactLabelClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

/** 工具行「从图读串」：选一张图 → 勾选框（拖到舞台上是另一条进法，落到同一个框）。 */
export function ImageRecipeImportChip({ disabled }: { disabled?: boolean }) {
  const t = useTranslations('ImageRecipeImport')
  return (
    <Toolbar.Button
      type="button"
      aria-label={t('button')}
      disabled={disabled}
      onClick={pickImageRecipeFile}
      className={cn(studioOutlineChipClass, studioOutlineChipCompactClass)}
    >
      <ScanText className="size-4" aria-hidden />
      <span className={studioOutlineChipCompactLabelClass}>{t('button')}</span>
    </Toolbar.Button>
  )
}
