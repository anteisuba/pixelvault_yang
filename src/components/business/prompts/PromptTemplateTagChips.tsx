'use client'

import { useMemo } from 'react'

import {
  formatTagWeight,
  isDefaultTagWeight,
  parseTagChips,
} from '@/lib/tag-composer'
import { cn } from '@/lib/utils'

interface PromptTemplateTagChipsProps {
  /** 存储串：逗号分隔，`tag:1.2` 是加过权重的那一格。 */
  text: string
  /** 只画前几格，多的写「+N」（卡片上 7 格）。 */
  limit?: number
  /** 负面：只描边、字淡一档，⛔ 用红。 */
  negative?: boolean
  className?: string
}

/**
 * 标签模板的一墙格子（pages/prompts.md「标签块」，画板 `TgA`）：等宽字、浅底，负面只
 * 描边。权重与标签台同一个写法（`×1.2`）。
 */
export function PromptTemplateTagChips({
  text,
  limit,
  negative,
  className,
}: PromptTemplateTagChipsProps) {
  const chips = useMemo(() => parseTagChips(text), [text])
  const shown = limit == null ? chips : chips.slice(0, limit)
  const more = chips.length - shown.length

  return (
    <ul className={cn('flex flex-wrap gap-1', className)}>
      {shown.map((chip, index) => (
        <li
          key={index}
          className={cn(
            'inline-flex h-5.5 min-w-0 max-w-full items-center gap-1 rounded-md px-1.75 font-mono text-xs',
            negative
              ? 'text-muted-foreground ring-1 ring-inset ring-border'
              : 'bg-muted text-foreground',
          )}
        >
          <span className="truncate" title={chip.text}>
            {chip.text}
          </span>
          {isDefaultTagWeight(chip.weight) ? null : (
            <span className="text-2xs tabular-nums text-muted-foreground">
              {formatTagWeight(chip.weight)}
            </span>
          )}
        </li>
      ))}
      {more > 0 ? (
        <li className="inline-flex h-5.5 items-center px-1 font-mono text-xs tabular-nums text-muted-foreground">
          +{more}
        </li>
      ) : null}
    </ul>
  )
}
