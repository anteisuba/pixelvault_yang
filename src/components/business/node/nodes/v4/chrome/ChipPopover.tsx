'use client'

/**
 * 贴 chip 出现的**参数弹层**容器（spec §1.5，画板 `PromptBar.dc.html` 的 `.pop`）。
 *
 * 只是容器：白面（`bg-popover`）+ `shadow-node-menu` + 14px 圆角，右对齐贴在
 * chip 上，Esc / 点外关闭。**内容由调用方传**——画面 / 模型 / 音色 / 视频参数
 * 四种弹层长得不一样，⛔ 不在这里 switch 出四个变体。分段控件用
 * `ToggleGroup variant="segmented"`（ui-defaults §3.1），⛔ 不拿一排 chip 冒充单选。
 *
 * 底座是 Radix `Popover`：Esc / 点外关闭、焦点陷阱、`fade-in-0 zoom-in-95` 全是
 * 它自带的（ui-defaults §4「不要覆盖」）。
 */

import type { ReactNode } from 'react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ChipPopoverProps {
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  /** chip 本身——弹层贴着它出现。必须是能接 ref 的单个元素。 */
  readonly trigger: ReactNode
  readonly children: ReactNode
  /** 画板上的两档宽：参数 300 / 模型 320。 */
  readonly width?: number
  readonly ariaLabel: string
  readonly className?: string
}

export function ChipPopover({
  open,
  onOpenChange,
  trigger,
  children,
  width,
  ariaLabel,
  className,
}: ChipPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label={ariaLabel}
        data-node-chrome="chip-popover"
        // 弹层才配 vibrancy；卡面不透明（node/CLAUDE.md 禁改第 6 条）。
        className={cn(
          'nodrag nopan nowheel w-auto rounded-xl border p-3 shadow-node-menu',
          className,
        )}
        style={width === undefined ? undefined : { width }}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
