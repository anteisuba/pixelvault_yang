'use client'

import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { cn } from '@/lib/utils'
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioAspectRatioPopover } from '@/components/business/studio/StudioAspectRatioPopover'
import { StudioCardsButton } from '@/components/business/studio/StudioCardsButton'
import { StudioEnhanceButton } from '@/components/business/studio/StudioEnhanceButton'
import { LoraPromptControlButton } from '@/components/business/studio/prompt-tags/LoraPromptControlButton'

interface StudioToolbarProps {
  disabled?: boolean
  compact?: boolean
}

/**
 * Studio toolbar — uses Radix Toolbar for roving tabindex keyboard navigation.
 * Image quick/card modes render the same five dock chips:
 * Assistant / Image / Cards / LoRA / Aspect ratio.
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
      <LoraPromptControlButton disabled={disabled} />
      <StudioAspectRatioPopover disabled={disabled} />
    </Toolbar.Root>
  )
}
