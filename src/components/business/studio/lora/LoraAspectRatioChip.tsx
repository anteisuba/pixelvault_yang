'use client'

import { useState } from 'react'
import { RatioIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { AspectRatio } from '@/constants/config'
import { LORA_GENERATE_ASPECT_RATIOS } from '@/constants/lora'
import { cn } from '@/lib/utils'

interface LoraAspectRatioChipProps {
  value: AspectRatio
  onChange: (value: AspectRatio) => void
  disabled?: boolean
}

/**
 * Visual wireframe of the picked ratio (mirrors StudioAspectRatioPopover's
 * RatioPreview) so portrait/landscape reads at a glance. Inscribed in a fixed
 * box; the rectangle scales to the ratio.
 */
function RatioPreview({ ratio }: { ratio: AspectRatio }) {
  const [w, h] = ratio.split(':').map(Number)
  const BOX = 72
  const scale = w >= h ? BOX / w : BOX / h
  return (
    <div className="flex size-[4.5rem] shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/20">
      <div
        className="rounded-sm border-2 border-foreground/80"
        style={{ width: `${w * scale}px`, height: `${h * scale}px` }}
        aria-hidden
      />
    </div>
  )
}

/**
 * P1-10 (D7①): aspect-ratio chip for the LoRA generate paper's tool row. The
 * link (handleGenerate → request `aspectRatio`) was already wired; the page just
 * had no control, locking users to 1:1 while LoRA output is mostly 3:4 立绘.
 * Self-contained plain Popover (LoRA domain has no Studio context), value/onChange
 * driven so the parent keeps the single source of truth and URL replay stays
 * bidirectional.
 */
export function LoraAspectRatioChip({
  value,
  onChange,
  disabled,
}: LoraAspectRatioChipProps) {
  const t = useTranslations('LoraWorkbench')
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('generate.aspectRatioLabel')}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
            open
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
          )}
        >
          <RatioIcon className="size-3.5" aria-hidden />
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-auto">
        <div className="flex items-center gap-3">
          <div
            role="radiogroup"
            aria-label={t('generate.aspectRatioLabel')}
            className="flex flex-col gap-1.5"
          >
            {LORA_GENERATE_ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                role="radio"
                aria-checked={value === ratio}
                onClick={() => onChange(ratio)}
                className={cn(
                  'inline-flex min-w-14 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  value === ratio
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                )}
              >
                {ratio}
              </button>
            ))}
          </div>
          <RatioPreview ratio={value} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
