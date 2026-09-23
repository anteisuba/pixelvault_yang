'use client'

/**
 * **规格行**（D12 A 定稿 · P1 / B6）—— 输入框正上方那一行灰字
 * 「Nano Banana Pro · 1:1 · 1 张 ▾」，说的是「这一句发出去会产出什么」。
 *
 * ⭐ 点它**就地**弹出模型 / 比例 / 张数 / 清晰度（B6：此前点开的是参数栏里那一颗，
 * 浮层弹到最左边，离手指头半个屏幕）。档位与确认卡同一份真值
 * （`buildOperatorKnobSpecs` ← 宿主现算的 `generationControls`），⛔ 不另攒一份。
 * ⚠ 宿主没有 `controls`（画布 / LoRA 装配台）时渲染成**非交互的一句读数**：
 * 不画 chevron、不加 hover、不是 button —— ⛔ 不做「点了没反应」。
 */

import { useState, type ComponentType } from 'react'
import { Check, ChevronDown } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_GENERATE_KNOB_IDS,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { buildOperatorKnobSpecs } from '@/lib/studio-operator-knobs'
import { cn } from '@/lib/utils'
import type { StudioOperatorGenerationControls } from '@/types/studio-assistant-operator'

interface StudioOperatorSpecLineProps {
  domainIcon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  /** 读屏先要知道这是哪个域（这一行写的只是「Seedream 5.0 Pro · 1:1 · 4 张」）。 */
  domainName: string
  text: string
  controls?: StudioOperatorGenerationControls
  onPick?(knob: StudioOperatorGenerateKnob, value: string): void
}

export function StudioOperatorSpecLine({
  domainIcon: DomainIcon,
  domainName,
  text,
  controls,
  onPick,
}: StudioOperatorSpecLineProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const knobs = controls
    ? buildOperatorKnobSpecs(controls, (count) =>
        t('confirm.generate.count', { count }),
      )
    : []
  const content = (
    <>
      <DomainIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{domainName}</span>
      <span className="min-w-0 truncate">{text}</span>
    </>
  )

  if (!onPick || knobs.length === 0) {
    return (
      <span
        data-testid="operator-spec-line"
        className="mx-4 mb-1.5 flex h-5.5 shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
      >
        {content}
      </span>
    )
  }

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          data-testid="operator-spec-line"
          data-open={open || undefined}
          className="mx-4 mb-1.5 flex h-5.5 shrink-0 items-center gap-1.5 self-start rounded-sm text-xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-open:text-foreground motion-reduce:transition-none"
        >
          {content}
          <span className="sr-only">{t('specLine.adjust')}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        side="top"
        align="start"
        label={t('specLine.adjust')}
        className="w-72 rounded-xl border-assistant-line-strong p-0 assistant-glass-overlay shadow-assistant-overlay"
        mobileClassName="px-0"
      >
        <div
          data-testid="operator-spec-menu"
          className="flex max-h-96 flex-col gap-3 overflow-y-auto p-3"
        >
          {knobs.map((knob) => {
            const label = t(
              `confirm.generate.${
                knob.id === STUDIO_OPERATOR_GENERATE_KNOB_IDS.count
                  ? 'countLabel'
                  : knob.id
              }`,
            )
            const isModel = knob.id === STUDIO_OPERATOR_GENERATE_KNOB_IDS.model
            return (
              <section
                key={knob.id}
                role="group"
                aria-label={label}
                className="flex flex-col gap-1.5"
              >
                <p className="text-2xs text-muted-foreground">{label}</p>
                <div
                  className={cn(
                    isModel
                      ? 'flex max-h-40 flex-col gap-0.5 overflow-y-auto'
                      : 'flex flex-wrap gap-1.5',
                  )}
                >
                  {knob.options.map((option) => {
                    const active = option.value === knob.current
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        data-testid="operator-spec-option"
                        data-knob={knob.id}
                        data-value={option.value}
                        onClick={() => onPick(knob.id, option.value)}
                        className={cn(
                          'flex items-center gap-2 text-xs transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                          isModel
                            ? 'justify-between rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-accent'
                            : 'h-7 rounded-md border px-2.5',
                          isModel
                            ? active && 'bg-muted font-medium'
                            : active
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border bg-card text-foreground hover:bg-accent',
                        )}
                      >
                        <span className="truncate">{option.label}</span>
                        {isModel && active ? (
                          <Check className="size-3.5 shrink-0" aria-hidden />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
