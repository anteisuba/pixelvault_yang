'use client'

import { RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  if (!checkpoint)
    return (
      <span className="block px-2 pb-2 text-2sm text-muted-foreground">
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
      className="mb-2 ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-2sm text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RotateCcw className="size-3" aria-hidden />
      {t('restoreStep')}
    </button>
  )
}
