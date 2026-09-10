'use client'

/**
 * 画布浮动工具条的**按钮形状**（图标 + 文字，h-9）。
 *
 * ③d-4 从 `CanvasImageSelectionToolbar`（legacy，随翻转删）搬出来 —— 它是纯样式，
 * 不读图、不读动作总线，**不挂在单个节点上**的浮动工具条都用同一个形状
 * （⛔ 不许再手抄一份）。
 *
 * ⚠ `coarse:before` 那圈是粗指针下的命中区外扩：视觉尺寸不变，可点区域上下各多
 * 4px，⛔ 别为了「看起来一样」把它删掉。
 */

import type { LucideIcon } from 'lucide-react'

export interface CanvasToolbarLabelButtonProps {
  readonly icon: LucideIcon
  readonly label: string
  onClick(): void
  readonly ariaLabel?: string
  readonly disabled?: boolean
}

export function ToolbarLabelButton({
  icon: Icon,
  label,
  onClick,
  ariaLabel,
  disabled,
}: CanvasToolbarLabelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      title={ariaLabel ?? label}
      className="relative flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-node-foreground transition-colors coarse:before:absolute coarse:before:-inset-y-1 coarse:before:inset-x-0 coarse:before:content-[''] hover:bg-node-panel-inner disabled:pointer-events-none disabled:opacity-50"
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  )
}
