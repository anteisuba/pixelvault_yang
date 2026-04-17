'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

interface StudioTransformToggleProps {
  variants: 1 | 4
  onVariantsChange: (variants: 1 | 4) => void
  disabled?: boolean
}

export const StudioTransformToggle = memo(function StudioTransformToggle({
  variants,
  onVariantsChange,
  disabled,
}: StudioTransformToggleProps) {
  const t = useTranslations('Transform.variants')

  return (
    <div className="inline-flex rounded-lg border border-border/60 p-0.5 text-xs">
      <button
        type="button"
        className={cn(
          'rounded-md px-3 py-1.5 font-medium transition-colors',
          variants === 4
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onVariantsChange(4)}
        disabled={disabled}
      >
        {t('full')}
      </button>
      <button
        type="button"
        className={cn(
          'rounded-md px-3 py-1.5 font-medium transition-colors',
          variants === 1
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onVariantsChange(1)}
        disabled={disabled}
      >
        {t('fast')}
      </button>
    </div>
  )
})
