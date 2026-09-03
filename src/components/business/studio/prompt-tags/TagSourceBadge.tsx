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
  civitai:
    'border-status-warning/40 bg-status-warning-surface text-status-warning',
  model_keyword: 'border-orange-300 bg-orange-50 text-orange-700',
  mined_prompt:
    'border-status-applied/40 bg-status-applied-surface text-status-applied',
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
