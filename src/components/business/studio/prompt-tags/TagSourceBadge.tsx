'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { PromptTagSource } from '@/types/prompt-tags'

interface TagSourceBadgeProps {
  source: PromptTagSource
  className?: string
}

/**
 * ⚠ 只有「已挖到」「要小心」两档带颜色（status token）—— 其余来源走同一块中性
 * 底（32 ③）：来源名就写在角标里，色相不必再答一遍，而蓝 / 紫 / 橙正是模态色与
 * 状态色的色相，摆在 prompts 域之外会把人往错的语义上带。
 */
const SOURCE_NEUTRAL_TONE = 'border-border bg-muted text-muted-foreground'

const SOURCE_TONE: Record<PromptTagSource, string> = {
  system: SOURCE_NEUTRAL_TONE,
  danbooru: SOURCE_NEUTRAL_TONE,
  lora_asset: SOURCE_NEUTRAL_TONE,
  civitai:
    'border-status-warning/40 bg-status-warning-surface text-status-warning',
  model_keyword: SOURCE_NEUTRAL_TONE,
  mined_prompt:
    'border-status-applied/40 bg-status-applied-surface text-status-applied',
  recent: SOURCE_NEUTRAL_TONE,
  user: SOURCE_NEUTRAL_TONE,
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
