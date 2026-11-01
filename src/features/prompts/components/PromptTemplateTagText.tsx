'use client'

import { Fragment, useMemo } from 'react'

import { isDefaultTagWeight, parseTagChips } from '@/lib/tag-composer'
import { cn } from '@/lib/utils'

interface PromptTemplateTagTextProps {
  /** 存储串：逗号分隔，`tag:1.2` 是加过权重的那一个。 */
  text: string
  /** 负面：字淡一档，⛔ 用红。 */
  negative?: boolean
  /** 卡片上截几行由调用方给（`line-clamp-*`）。 */
  className?: string
}

/**
 * 标签模板里的一串标签 —— 只看的地方也是**一段逗号隔开的字**（owner 2026-10-24 ㉘，
 * 与标签台纯文本框同一个写法）：等宽字，权重后缀 `:1.2` 浅一档。
 */
export function PromptTemplateTagText({
  text,
  negative,
  className,
}: PromptTemplateTagTextProps) {
  const chips = useMemo(() => parseTagChips(text), [text])

  return (
    <p
      className={cn(
        'break-words font-mono text-xs leading-5',
        negative ? 'text-muted-foreground' : 'text-foreground',
        className,
      )}
    >
      {chips.map((chip, index) => (
        <Fragment key={index}>
          {index > 0 ? ', ' : null}
          {chip.text}
          {isDefaultTagWeight(chip.weight) ? null : (
            <span className="text-muted-foreground">:{chip.weight}</span>
          )}
        </Fragment>
      ))}
    </p>
  )
}
