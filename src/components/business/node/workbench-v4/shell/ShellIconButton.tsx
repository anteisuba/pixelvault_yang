'use client'

/**
 * 外壳上那颗**唯一**的图标按钮（画板：34 见方 · 10 圆角 · 按下态 6% 墨底）。
 *
 * 左侧图标栏 / 底栏 / 双击快捷加节点三处长得一模一样，⛔ 不各写一份：它们在画板上
 * 就是同一颗（`ChromeOverview.dc.html` 三处的 inline style 逐字相同）。
 */

import type { ComponentType } from 'react'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { cn } from '@/lib/utils'

export interface ShellIconButtonProps {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly active?: boolean
  readonly disabled?: boolean
  readonly testId?: string
  onClick(): void
}

export function ShellIconButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  testId,
  onClick,
}: ShellIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
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
        'flex shrink-0 items-center justify-center transition-colors',
        disabled
          ? // 禁用态用 `--node-subtle`（3.82:1）：WCAG 对 disabled 控件不设门槛，
            // 而画板上「不能撤了」正是靠这一档更浅的灰说话。
            'text-node-subtle'
          : active
            ? 'bg-node-panel-inner text-node-foreground'
            : 'text-node-muted hover:text-node-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}
