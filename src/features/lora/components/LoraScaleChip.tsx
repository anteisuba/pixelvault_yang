'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ParamSlider } from '@/components/ui/param-slider'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { NumericRange } from '@/constants/provider-capabilities'
import { cn } from '@/lib/utils'

interface LoraScaleChipProps {
  /** LoRA display name — for the popover title + aria label. */
  name: string
  /** Current effective scale (entry.scale ?? asset.defaultScale). */
  value: number
  onChange: (value: number) => void
  config: NumericRange
  disabled?: boolean
}

/**
 * B10 (D7②): the spine-bar LoRA chip's "×1.0" becomes a popover trigger that
 * opens a scale slider. Per-chip independent — each mounted LoRA writes back its
 * own entry.scale via onChange, so a 2-mount stack can be tuned separately. The
 * slider range comes from the base model's `loraScale` capability (0.1–2.0).
 */
export function LoraScaleChip({
  name,
  value,
  onChange,
  config,
  disabled,
}: LoraScaleChipProps) {
  const t = useTranslations('LoraWorkbench')
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('spine.scaleLabel', { name })}
          className={cn(
            'rounded-full px-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50',
            open && 'text-primary',
          )}
        >
          ×{value.toFixed(2)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-56">
        <ParamSlider
          label={t('spine.scaleLabel', { name })}
          hint={t('spine.scaleHint')}
          value={value}
          onChange={onChange}
          min={config.min}
          max={config.max}
          step={config.step}
          formatValue={(v) => `×${v.toFixed(2)}`}
        />
      </PopoverContent>
    </Popover>
  )
}
