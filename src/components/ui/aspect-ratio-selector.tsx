'use client'

import { OptionGroup } from '@/components/ui/option-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface OptionItem {
  value: string
  label: string
}

interface AspectRatioSelectorProps {
  options: readonly OptionItem[] | readonly string[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /**
   * `primary` / `neutral` = 胶囊排（表单里的既有形态）。
   * `segmented` = HIG 分段控件，给画布节点卡的 inset 分组用（ui-defaults §3.1）：
   * 互斥参数一行一格 + 滑动 thumb，⛔ 不在窄卡里排成会换行的 chip 墙。
   */
  variant?: 'primary' | 'neutral' | 'segmented'
}

/**
 * Aspect ratio pill selector. Thin wrapper around OptionGroup
 * for semantic clarity in generation forms.
 */
export function AspectRatioSelector({
  options,
  value,
  onChange,
  disabled,
  variant = 'primary',
}: AspectRatioSelectorProps) {
  const normalized: OptionItem[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  )

  if (variant === 'segmented') {
    return (
      <ToggleGroup
        type="single"
        variant="segmented"
        value={value}
        // 分段控件是互斥单选：点当前格不取消（取消等于「没有比例」，不是合法态）。
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
        disabled={disabled}
        className="w-full"
      >
        {normalized.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value}>
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  return (
    <OptionGroup
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      variant={variant}
    />
  )
}
