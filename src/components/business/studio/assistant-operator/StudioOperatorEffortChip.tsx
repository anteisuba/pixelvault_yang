'use client'

/**
 * 输入区**思考档位 chip**（owner 2026-10-10 选 B：模型 chip 旁单独一颗）。
 *
 * ⭐ 三档 Low / Medium / High 三语都写英文（像 Claude Code）；各家原生档位的
 * 换算在服务端（`resolveAssistantV3Model` / `llm-text` 各 builder），这里只管选。
 * ⭐ 存在 `AssistantPersona.reasoningEffort`，理由同模型 chip：是「我习惯让它想
 * 多久」，属于人设。没存上就撤回乐观值，同模型 chip。
 * ⚠ 输入条窄于 `@assistant-bar` 时只留一个脑图标（owner 2026-10-10），档位看
 * 菜单和悬停提示 —— 320 宽的面板里两颗 chip 一共只有 70px。
 */

import { useCallback, useState } from 'react'
import { Brain, Check, ChevronDown, ChevronUp } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_REASONING_EFFORTS,
  type AssistantReasoningEffort,
} from '@/constants/assistant-persona'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { cn } from '@/lib/utils'

export interface StudioOperatorEffortChipProps {
  value: AssistantReasoningEffort
  onChange(next: AssistantReasoningEffort): void | boolean | Promise<boolean>
}

export function StudioOperatorEffortChip({
  value,
  onChange,
}: StudioOperatorEffortChipProps) {
  const t = useTranslations('StudioOperator.effortChip')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<{
    next: AssistantReasoningEffort
    base: AssistantReasoningEffort
  } | null>(null)
  const selected = pending && pending.base === value ? pending.next : value

  const commit = useCallback(
    async (next: AssistantReasoningEffort) => {
      setOpen(false)
      if (next === selected) return
      setPending({ next, base: value })
      const ok = await onChange(next)
      if (ok === false) setPending(null)
    },
    [onChange, selected, value],
  )

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          data-testid="operator-effort-chip"
          aria-label={`${t('label')} ${t(`levels.${selected}`)}`}
          title={`${t('label')} ${t(`levels.${selected}`)}`}
          data-open={open || undefined}
          className={cn(
            'flex h-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md @max-assistant-bar:w-7 @assistant-bar:px-1.5 text-xs transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            open ? 'bg-accent text-foreground' : 'text-muted-foreground',
          )}
        >
          <Brain className="size-4 @assistant-bar:hidden" aria-hidden />
          <span className="hidden @assistant-bar:inline">
            {t('label')} {t(`levels.${selected}`)}
          </span>
          {open ? (
            <ChevronUp
              className="hidden size-3 shrink-0 @assistant-bar:block"
              aria-hidden
            />
          ) : (
            <ChevronDown
              className="hidden size-3 shrink-0 @assistant-bar:block"
              aria-hidden
            />
          )}
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        side="top"
        align="start"
        label={t('label')}
        className="w-56 rounded-xl border-assistant-line-strong p-0 assistant-glass-overlay shadow-assistant-overlay"
        mobileClassName="px-0"
      >
        <div
          role="menu"
          aria-label={t('label')}
          data-testid="operator-effort-chip-menu"
          className="flex flex-col gap-0.5 p-1.5"
        >
          {ASSISTANT_REASONING_EFFORTS.map((effort) => {
            const isSelected = selected === effort
            return (
              <button
                key={effort}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                data-testid={`operator-effort-option-${effort}`}
                onClick={() => void commit(effort)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-fast ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected && 'bg-muted',
                )}
              >
                <span className="flex flex-col gap-px">
                  <span className="text-2sm font-medium text-foreground">
                    {t(`levels.${effort}`)}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {t(`hints.${effort}`)}
                  </span>
                </span>
                {isSelected ? (
                  <Check
                    className="size-3.5 shrink-0 text-foreground"
                    aria-hidden
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
