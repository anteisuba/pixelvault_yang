'use client'

/**
 * 外壳上那颗**唯一**的图标按钮（32 见方 · 10 圆角 · 按下态 6% 墨底；尺寸读 `CANVAS_SHELL_LAYOUT.iconButtonPx`）。
 *
 * 底栏上每一颗（含末尾那颗「添加节点」＋）都是它，⛔ 不各写一份：它们在画板上
 * 就是同一颗（`ChromeOverview.dc.html` 里的 inline style 逐字相同）。
 *
 * 按下统一 0.96、悬停标签立刻出（node-canvas-v2 §1 第 12 条）—— ⛔ 不用原生
 * `title`：那要等一秒多，还会和这颗标签叠成两个。
 */

import type {
  ButtonHTMLAttributes,
  ComponentType,
  MouseEventHandler,
  Ref,
} from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  CANVAS_SHELL_LAYOUT,
  CANVAS_SHELL_SIDEBAR_ENTRY_ATTR,
  type CanvasShellPanelId,
} from '@/constants/canvas-shell'
import { cn } from '@/lib/utils'

/**
 * 其余 button 属性原样落到按钮上 —— 只为让它能当 Radix 触发器（`PopoverTrigger asChild`
 * 会塞 `aria-expanded` / `data-state` / 合成的 `onClick`），⛔ 别拿它换外观。
 */
type ShellIconButtonPassthrough = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'type'
  | 'children'
  | 'className'
  | 'style'
  | 'onClick'
  | 'disabled'
  | 'aria-label'
  | 'aria-pressed'
>

export interface ShellIconButtonProps extends ShellIconButtonPassthrough {
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
  /**
   * 这颗是哪一格左侧面板的入口（底栏的角色 / 素材库）：挂上
   * `CANVAS_SHELL_SIDEBAR_ENTRY_ATTR`，面板的液态开合据它找到从哪一颗长出来。
   */
  readonly panelEntry?: CanvasShellPanelId
  readonly ref?: Ref<HTMLButtonElement>
  /** 当弹层触发器时可省（触发器自己合成点击）。 */
  readonly onClick?: MouseEventHandler<HTMLButtonElement>
}

export function ShellIconButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  testId,
  externalActiveSurface = false,
  tooltipSide = 'top',
  panelEntry,
  ref,
  onClick,
  ...passthrough
}: ShellIconButtonProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            {...passthrough}
            ref={ref}
            type="button"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            data-testid={testId}
            {...(panelEntry
              ? { [CANVAS_SHELL_SIDEBAR_ENTRY_ATTR]: panelEntry }
              : {})}
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
