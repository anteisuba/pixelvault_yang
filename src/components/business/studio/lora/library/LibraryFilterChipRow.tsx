'use client'

// S2（docs/references/pages/lora-workbench.md §3.4/§7）：`FamilyChipRow`（S1）
// 和「类型」chip 行共享同一套形制（h-8 / 选中态 border-primary/40
// bg-primary/10 text-primary / 触屏 44px 命中区 / role="group"+aria-pressed /
// 移动端横滚）——把形制抽成这个泛型基座，两行各自只提供行首标 + 值域 +
// label 文案，避免重复维护同一套 className。
import { cn } from '@/lib/utils'

interface LibraryFilterChipRowOption<T extends string> {
  value: T
  label: string
}

interface LibraryFilterChipRowProps<T extends string> {
  /** 行首标（uppercase text-2xs muted，如「类型」「底模」）。 */
  rowLabel: string
  /** chip 组的 aria-label（role="group"）。 */
  groupAriaLabel: string
  value: T
  options: readonly LibraryFilterChipRowOption<T>[]
  onChange: (value: T) => void
}

export function LibraryFilterChipRow<T extends string>({
  rowLabel,
  groupAriaLabel,
  value,
  options,
  onChange,
}: LibraryFilterChipRowProps<T>) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* §12 行首标定宽对齐：w-7(28px，Tailwind 标准档，就近覆盖设计稿
          26px 目标，复用现有 scale 不新开任意值)——类型/底模两行左边界
          对齐；长译名（如 en "Base model"）超宽时自然换行，不撑破对齐。 */}
      <span className="w-7 shrink-0 text-2xs font-medium uppercase leading-tight tracking-wide text-muted-foreground">
        {rowLabel}
      </span>
      <div
        role="group"
        aria-label={groupAriaLabel}
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1"
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
                'relative inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors',
                // 触屏断点把点击区纵向扩到 44px（32 + 2×6），视觉不变。
                "coarse:before:absolute coarse:before:-inset-y-1.5 coarse:before:inset-x-0 coarse:before:content-['']",
                isActive
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
