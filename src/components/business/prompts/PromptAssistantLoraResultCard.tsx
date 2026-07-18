'use client'

import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { getPromptTagPopularityTier } from '@/lib/prompt-tag-autocomplete'
import { cn } from '@/lib/utils'
import type { PromptAssistantLoraTag } from '@/types'

/**
 * F2 结果卡（docs/plans/lora-assistant-nl2tag-2026-07.md §1.2）：把 `mode:
 * 'lora'` + `loraContext` 引擎返回的结构化 `{positive, negative, note}`
 * 渲染成 chips，替代 `PromptAssistantPanel` 默认的纯文本气泡。
 *
 * 词库命中 = 实心 chip（mono 文本 + 类别徽标 + S6 同款热度点）；未命中 =
 * 虚线灰「自由词」chip（不隐藏——失败大声暴露，用户可 × 删后再填入）；
 * 模糊命中额外标一个 `*`（已规范化）。× 删除是本条消息内的局部状态，不
 * 回写到 hook 的对话历史——「填入/追加」只作用于删除后仍可见的 chips。
 *
 * 「填入正文」「追加到正文」只有一对按钮，同时作用于正/负两组（负向落
 * 负向框，拍板③）；两个负向回调只有在对应分组还有可见 chip 时才会被调用，
 * 避免用空字符串覆盖用户已有的负向框内容。
 */

/**
 * 真机实测发现的边界情况：F1 引擎的原始输出去重按"规范化前的原文"做（见
 * `filterLoraAssistantOutputTags`），两个不同原文（如 "masterpiece" 和
 * "best quality"）模糊命中同一个词库条目时，各自都会保留成一个 tag——
 * canonical/text 落地后就是肉眼可见的重复 chip。这里按最终展示文本
 * （大小写不敏感）再去重一次，不依赖上游是否已经去重。
 */
function joinTagText(tags: readonly PromptAssistantLoraTag[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const tag of tags) {
    const text = tag.canonical ?? tag.text
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(text)
  }
  return parts.join(', ')
}

function toggleIndex(
  prev: ReadonlySet<number>,
  index: number,
): ReadonlySet<number> {
  const next = new Set(prev)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

interface PromptAssistantLoraResultCardProps {
  positive: readonly PromptAssistantLoraTag[]
  negative: readonly PromptAssistantLoraTag[]
  note?: string
  /** True when the LoRA persona currently has at least one mount — drives
   *  the static "trigger words are already handled by the chip row" line
   *  (only relevant when there's something to explain the omission of). */
  hasMounts: boolean
  onFillPrompt: (text: string) => void
  onAppendPrompt: (text: string) => void
  onFillNegativePrompt: (text: string) => void
  onAppendNegativePrompt: (text: string) => void
}

export function PromptAssistantLoraResultCard({
  positive,
  negative,
  note,
  hasMounts,
  onFillPrompt,
  onAppendPrompt,
  onFillNegativePrompt,
  onAppendNegativePrompt,
}: PromptAssistantLoraResultCardProps) {
  const t = useTranslations('PromptAssistant')
  const tTags = useTranslations('PromptTags')
  const [removedPositive, setRemovedPositive] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const [removedNegative, setRemovedNegative] = useState<ReadonlySet<number>>(
    () => new Set(),
  )

  const visiblePositive = positive.filter(
    (_, index) => !removedPositive.has(index),
  )
  const visibleNegative = negative.filter(
    (_, index) => !removedNegative.has(index),
  )
  const hasAnyChips = positive.length > 0 || negative.length > 0

  const handleFill = () => {
    onFillPrompt(joinTagText(visiblePositive))
    if (visibleNegative.length > 0) {
      onFillNegativePrompt(joinTagText(visibleNegative))
    }
  }

  const handleAppend = () => {
    if (visiblePositive.length > 0) onAppendPrompt(joinTagText(visiblePositive))
    if (visibleNegative.length > 0) {
      onAppendNegativePrompt(joinTagText(visibleNegative))
    }
  }

  return (
    <div className="max-w-[95%] space-y-2 rounded-lg bg-secondary/60 p-2.5">
      {positive.length > 0 ? (
        <TagGroup
          label={t('assistantResultPositive')}
          tags={positive}
          removed={removedPositive}
          onToggle={(index) =>
            setRemovedPositive((prev) => toggleIndex(prev, index))
          }
          tTags={tTags}
          freeWordLabel={t('assistantFreeWord')}
          normalizedLabel={t('assistantNormalized')}
          removeLabel={(tag) => t('assistantRemoveChip', { tag })}
        />
      ) : null}
      {negative.length > 0 ? (
        <TagGroup
          label={t('assistantResultNegative')}
          tags={negative}
          removed={removedNegative}
          onToggle={(index) =>
            setRemovedNegative((prev) => toggleIndex(prev, index))
          }
          tTags={tTags}
          freeWordLabel={t('assistantFreeWord')}
          normalizedLabel={t('assistantNormalized')}
          removeLabel={(tag) => t('assistantRemoveChip', { tag })}
        />
      ) : null}

      {hasAnyChips ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFill}
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            <Check className="size-3" />
            {t('usePrompt')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAppend}
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            <Plus className="size-3" />
            {t('appendPrompt')}
          </Button>
        </div>
      ) : null}

      {note || hasMounts ? (
        <div className="space-y-0.5 text-2xs text-muted-foreground">
          {note ? <p>{note}</p> : null}
          {hasMounts ? <p>{t('assistantTriggerNote')}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

interface TagGroupProps {
  label: string
  tags: readonly PromptAssistantLoraTag[]
  removed: ReadonlySet<number>
  onToggle: (index: number) => void
  tTags: ReturnType<typeof useTranslations>
  freeWordLabel: string
  normalizedLabel: string
  removeLabel: (tag: string) => string
}

function TagGroup({
  label,
  tags,
  removed,
  onToggle,
  tTags,
  freeWordLabel,
  normalizedLabel,
  removeLabel,
}: TagGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      {tags.map((tag, index) => {
        if (removed.has(index)) return null
        const displayText = tag.canonical ?? tag.text
        const tier = tag.free
          ? null
          : getPromptTagPopularityTier(tag.popularity)
        const categoryLabel = tag.category
          ? tTags(`category.${tag.category}`)
          : null

        return (
          <span
            key={`${displayText}-${index}`}
            title={tag.free ? freeWordLabel : (categoryLabel ?? undefined)}
            className={cn(
              'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-2xs transition-colors',
              tag.free
                ? 'border-dashed border-muted-foreground/35 text-muted-foreground'
                : 'border-border/60 text-foreground',
            )}
          >
            {tier ? (
              <span
                aria-hidden
                className={cn(
                  'size-1.5 shrink-0 rounded-full bg-muted-foreground',
                  tier === 'low' && 'opacity-30',
                  tier === 'mid' && 'opacity-60',
                  tier === 'high' && 'opacity-100',
                )}
              />
            ) : null}
            <span className="max-w-32 truncate font-mono">{displayText}</span>
            {tag.normalized ? (
              <span
                aria-hidden
                title={normalizedLabel}
                className="text-muted-foreground/60"
              >
                *
              </span>
            ) : null}
            {categoryLabel && !tag.free ? (
              <span className="shrink-0 text-3xs text-muted-foreground/70">
                {categoryLabel}
              </span>
            ) : null}
            <button
              type="button"
              aria-label={removeLabel(displayText)}
              onClick={() => onToggle(index)}
              className="ml-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-2.5" />
            </button>
          </span>
        )
      })}
    </div>
  )
}
