'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// R1 close-review（owner 2026-07-19）：公开/我的、来源（Civitai/HuggingFace）
// 都只有两个值——owner「不要做下拉列表」。收敛成同一套紧凑 segmented 切换，
// 放在顶栏右簇（与搜索同行）。带点击按压过渡（active:scale + 颜色过渡）。

interface LoraLibrarySegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface LoraLibrarySegmentedProps<T extends string> {
  value: T
  options: readonly LoraLibrarySegmentedOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
}

export function LoraLibrarySegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: LoraLibrarySegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 gap-1 rounded-lg bg-muted/40 p-1"
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-[color,background-color,box-shadow,transform] active:scale-[0.97]',
              isActive
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
