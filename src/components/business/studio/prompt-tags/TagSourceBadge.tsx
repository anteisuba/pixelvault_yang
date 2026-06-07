'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { PromptTagSource } from '@/types/prompt-tags'

interface TagSourceBadgeProps {
  source: PromptTagSource
  className?: string
}

const SOURCE_TONE: Record<PromptTagSource, string> = {
  system: 'border-neutral-300 bg-neutral-100 text-neutral-700',
  danbooru: 'border-sky-300 bg-sky-50 text-sky-700',
  lora_asset: 'border-violet-300 bg-violet-50 text-violet-700',
  civitai: 'border-amber-300 bg-amber-50 text-amber-700',
  mined_prompt: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  recent: 'border-neutral-300 bg-neutral-100 text-neutral-700',
  user: 'border-neutral-300 bg-neutral-100 text-neutral-700',
}

export function TagSourceBadge({ source, className }: TagSourceBadgeProps) {
  const t = useTranslations('PromptTags.source')

  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-2xs font-medium',
        SOURCE_TONE[source],
        className,
      )}
    >
      {t(source)}
    </span>
  )
}
