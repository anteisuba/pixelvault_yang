'use client'

import { useTranslations } from 'next-intl'

import { BlurSwap } from '@/components/ui/blur-swap'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CapabilityChip } from '@/lib/model-capability-chips'

/**
 * 选项少、字短时排成一条分段（owner 2026-10-07「专属」A1）；多了或字长就收成下拉 ——
 * 分段在 360 宽的弹层里排不下八个采样器名。阈值按「一行放得下」定，⛔ 不按模型分支。
 */
const SEGMENTED_MAX_OPTIONS = 6
const SEGMENTED_MAX_LABEL_CHARS = 24

function fitsSegmented(labels: readonly string[]): boolean {
  return (
    labels.length <= SEGMENTED_MAX_OPTIONS &&
    labels.reduce((sum, label) => sum + label.length, 0) <=
      SEGMENTED_MAX_LABEL_CHARS
  )
}

/**
 * 一项「选一档」的专属能力 —— 工作台「专属」弹层与标签台右列**共用这一颗**，
 * ⛔ 别再各画一排大圆按钮（`OptionGroup` 已删）。
 */
export function CapabilitySelectControl({
  chip,
  value,
  label,
  disabled = false,
  onChange,
}: {
  chip: CapabilityChip
  value: string
  label: string
  disabled?: boolean
  onChange: (next: string) => void
}) {
  const tAdvanced = useTranslations('AdvancedSettings')
  const items = (chip.options ?? []).map((option) => ({
    value: option,
    label: tAdvanced(`${chip.capability}Option.${option}`),
  }))
  if (fitsSegmented(items.map((item) => item.label))) {
    return (
      <LiquidSegmented
        items={items}
        value={value}
        onChange={onChange}
        ariaLabel={label}
        disabled={disabled}
        semantics="radio"
        size="xs"
        fill
      />
    )
  }
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className="h-7 w-full font-mono text-xs coarse:h-11"
      >
        {/* 换了一档 = 值字糊一下换掉。 */}
        <BlurSwap swapKey={value} className="min-w-0">
          <SelectValue />
        </BlurSwap>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="text-xs">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
