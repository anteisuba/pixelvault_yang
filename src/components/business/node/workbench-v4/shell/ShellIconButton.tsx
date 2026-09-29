'use client'

/**
 * 外壳上那颗**唯一**的图标按钮（画板：34 见方 · 10 圆角 · 按下态 6% 墨底）。
 *
 * 左侧图标栏 / 底栏 / 双击快捷加节点三处长得一模一样，⛔ 不各写一份：它们在画板上
 * 就是同一颗（`ChromeOverview.dc.html` 三处的 inline style 逐字相同）。
 *
 * 按下统一 0.96、悬停标签立刻出（node-canvas-v2 §1 第 12 条）—— ⛔ 不用原生
 * `title`：那要等一秒多，还会和这颗标签叠成两个。
 */

import type { ComponentType, Ref } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { cn } from '@/lib/utils'

export interface ShellIconButtonProps {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly active?: boolean
  readonly disabled?: boolean
  readonly testId?: string
  /**
   * 选中底色**由容器来画**（左侧栏那块会滑动的选中底块）：按下态不再铺自己的底，
   * 只留前景色，并抬成 `relative` 压在容器的底块之上。`aria-pressed` 照旧跟 `active`。
   * 默认 `false` = 画板上那颗原样。
   */
  readonly externalActiveSurface?: boolean
  /** 标签在哪一边（竖排的左侧栏给 `right`；贴边时 Radix 自己翻面）。 */
  readonly tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  readonly ref?: Ref<HTMLButtonElement>
  onClick(): void
}

export function ShellIconButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  testId,
  externalActiveSurface = false,
  tooltipSide = 'top',
  ref,
  onClick,
}: ShellIconButtonProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            data-testid={testId}
            onClick={onClick}
            style={{
              width: CANVAS_SHELL_LAYOUT.iconButtonPx,
              height: CANVAS_SHELL_LAYOUT.iconButtonPx,
              borderRadius: CANVAS_SHELL_LAYOUT.iconButtonRadiusPx,
            }}
            // 颜色只用脊柱那两档：`--node-muted` 对玻璃 6.82:1（浅）/ 5.89:1（深），
            // ⛔ 不用 `--node-subtle`（3.82 / 3.18，够不着正文 4.5:1 —— 实算见任务报告）。
            className={cn(
              'flex shrink-0 items-center justify-center transition-[color,background-color,transform] duration-fast ease-standard active:scale-96 motion-reduce:active:scale-100',
              externalActiveSurface && 'relative',
              disabled
                ? // 禁用态用 `--node-subtle`（3.82:1）：WCAG 对 disabled 控件不设门槛，
                  // 而画板上「不能撤了」正是靠这一档更浅的灰说话。
                  'text-node-subtle'
                : active
                  ? externalActiveSurface
                    ? 'text-node-foreground'
                    : 'bg-node-panel-inner text-node-foreground'
                  : 'text-node-muted hover:text-node-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
