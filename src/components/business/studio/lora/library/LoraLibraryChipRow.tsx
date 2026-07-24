'use client'

import { cn } from '@/lib/utils'

export interface LoraLibraryChipOption {
  value: string
  label: string
}

interface LoraLibraryChipRowProps {
  /** 行首小标签（如「底模」）；分类行不传。 */
  label?: string
  ariaLabel: string
  options: readonly LoraLibraryChipOption[]
  value: string
  onChange: (value: string) => void
}

// S3 库 modal：分类 / 底模族筛选从下拉（LoraLibraryFilterCombobox）改回横排
// chip（配屏 3 设计·R1 曾把 chip 改成下拉，此处回到 chip 行）。纯受控展示件，
// 状态仍留在各源 library hook；近炭暖灰皮走语义槽，选中 = primary 实心。
export function LoraLibraryChipRow({
  label,
  ariaLabel,
  options,
  value,
  onChange,
}: LoraLibraryChipRowProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1.5"
    >
      {label ? (
        <span className="mr-0.5 shrink-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : null}
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
