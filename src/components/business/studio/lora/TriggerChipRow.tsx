'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

export interface TriggerChipEntry {
  assetId: string
  /** Mounted LoRA's display name — truncated in the chip, full name in title. */
  name: string
  /** Non-empty trigger word. Callers only build an entry when this is truthy. */
  triggerWord: string
}

interface TriggerChipRowProps {
  entries: readonly TriggerChipEntry[]
  disabledIds: ReadonlySet<string>
  onToggle: (assetId: string) => void
}

/**
 * lora-workbench.md §4.3 触发词 chips 行：正文 textarea 上方、纸面形制小
 * chips——只对「当前挂载 且 带触发词」的 LoRA 生成一枚 chip（调用方从
 * stack.items 过滤 triggerWord 非空的挂载得到 entries，无触发词的挂载天然
 * 不在这里，无数据不渲染）；挂载即现、卸载即删，都是 entries 随 stack.items
 * 派生的自然结果，这里不做任何额外持久化。
 *
 * chip 可单独点击停用/启用：停用态不进编译（GenerateBranch.handleGenerate
 * 用 disabledIds 过滤后把剩下的喂给 compilePromptTags 的 selections）。
 * 名字用 truncate + title 露全名——沿用 LoraSpineBar chip 已有的截断惯例，
 * 不额外造"缩写"算法；触发词是功能性内容，不截断，用 mono 字体强调"这是
 * 要害词，不是普通文字"。
 */
export function TriggerChipRow({
  entries,
  disabledIds,
  onToggle,
}: TriggerChipRowProps) {
  const t = useTranslations('LoraWorkbench')

  if (entries.length === 0) return null

  return (
    <div
      role="group"
      aria-label={t('generate.triggerChipRowLabel')}
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="text-2xs uppercase tracking-wide text-surface-composer-foreground/50">
        {t('generate.triggerChipRowLabel')}
      </span>
      {entries.map((entry) => {
        const isDisabled = disabledIds.has(entry.assetId)
        return (
          <button
            key={entry.assetId}
            type="button"
            onClick={() => onToggle(entry.assetId)}
            aria-pressed={!isDisabled}
            title={
              isDisabled
                ? `${entry.name} — ${t('generate.triggerChipDisabledHint')}`
                : entry.name
            }
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-2xs transition-colors',
              isDisabled
                ? 'border-dashed border-surface-composer-foreground/20 text-surface-composer-foreground/40 line-through'
                : 'border-surface-composer-foreground/25 text-surface-composer-foreground hover:border-surface-composer-foreground/40',
            )}
          >
            <span className="max-w-20 truncate">{entry.name}</span>
            <span className="shrink-0 font-mono text-3xs opacity-80">
              {entry.triggerWord}
            </span>
          </button>
        )
      })}
    </div>
  )
}
