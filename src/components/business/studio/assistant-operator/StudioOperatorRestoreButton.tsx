'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { StudioOperatorCheckpoint } from '@/types/studio-operator-checkpoint'

export function StudioOperatorRestoreButton({
  checkpoint,
  disabled,
  onRestore,
}: {
  checkpoint?: StudioOperatorCheckpoint
  disabled: boolean
  onRestore(checkpoint: StudioOperatorCheckpoint): void
}) {
  const t = useTranslations('StudioOperator.checkpoint')
  /* D12 S13：「恢复到这一步」**只在悬停那一行出现**（父级 `group/step`），
     ⛔ 不常驻；键盘聚焦时同样现身。 */
  const reveal =
    'shrink-0 text-xs opacity-0 transition-opacity duration-(--duration-fast) ease-standard group-hover/step:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none'
  if (!checkpoint)
    return (
      <span className={cn(reveal, 'text-muted-foreground')}>
        {t('unavailable')}
      </span>
    )
  return (
    <button
      type="button"
      data-testid="operator-restore-step"
      disabled={disabled}
      onClick={() => onRestore(checkpoint)}
      title={t('restoreDescription')}
      className={cn(
        reveal,
        'rounded-sm text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {t('restoreStep')}
    </button>
  )
}
