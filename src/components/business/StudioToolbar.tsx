'use client'

import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { cn } from '@/lib/utils'
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioAspectRatioPopover } from '@/components/business/studio/StudioAspectRatioPopover'
import { StudioCardsButton } from '@/components/business/studio/StudioCardsButton'
import { StudioEnhanceButton } from '@/components/business/studio/StudioEnhanceButton'
import { StudioResolutionPopover } from '@/components/business/studio/StudioResolutionPopover'

interface StudioToolbarProps {
  disabled?: boolean
  compact?: boolean
}

/**
 * Studio toolbar — uses Radix Toolbar for roving tabindex keyboard navigation.
 * Image quick/card modes render four fixed dock chips (Assistant / Image /
 * Cards / Aspect ratio) plus a 5th Resolution/quality chip that only
 * renders when the selected model has a resolution or quality capability
 * (see StudioResolutionPopover).
 *
 * LoRA is no longer an Image Studio concern — it lives in its own domain
 * (/studio/lora). See docs/plans/lora-domain-split-2026-06.md.
 */
export function StudioToolbar({ disabled, compact }: StudioToolbarProps) {
  const t = useTranslations('StudioV2')

  return (
    <Toolbar.Root
      className={cn(
        'flex items-center gap-1.5',
        compact
          ? 'flex-nowrap border-t-0 pt-0'
          : 'flex-wrap border-t border-border/60 pt-2.5',
      )}
      aria-label={t('toolbarLabel')}
    >
      <StudioEnhanceButton disabled={disabled} />
      <ReferenceImageChip disabled={disabled} />
      <StudioCardsButton disabled={disabled} />
      <StudioAspectRatioPopover disabled={disabled} />
      <StudioResolutionPopover disabled={disabled} />
    </Toolbar.Root>
  )
}
