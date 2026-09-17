'use client'

import { Camera, Sparkles, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { EmptyState as EmptyStateTemplate } from '@/components/ui/empty-state'

export interface EmptyStateProps {
  /** Pick-a-preset action handler — opens preset grid focus, or selects first preset. */
  onSelectPreset: () => void
  /** Direct image-upload action — bypasses preset selection. */
  onUploadImages: () => void
  className?: string
}

/**
 * First-load state for /studio/lora?section=train with no history. The two
 * CTAs map to the two real starting points: pick a preset (guided) or start
 * uploading (manual).
 *
 * The 120px camera-and-sparkle illustration that used to sit on top is gone
 * (visual language board D1 ④, owner 2026-09-17): every empty state now wears
 * the one template in `ui/empty-state.tsx`, whose icon slot is a neutral 40px
 * square rather than a per-screen drawing.
 */
export function EmptyState({
  onSelectPreset,
  onUploadImages,
  className,
}: EmptyStateProps) {
  const t = useTranslations('LoraTraining')

  return (
    <EmptyStateTemplate
      className={className}
      icon={<Camera />}
      title={t('emptyTitle')}
      description={t('emptyDescription')}
      action={
        <Button className="rounded-full" onClick={onSelectPreset}>
          <Sparkles aria-hidden />
          {t('emptyCtaPreset')}
        </Button>
      }
      secondaryAction={
        <Button
          variant="outline"
          className="rounded-full"
          onClick={onUploadImages}
        >
          <Upload aria-hidden />
          {t('emptyCtaUpload')}
        </Button>
      }
    />
  )
}
