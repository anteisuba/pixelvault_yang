'use client'

import { ChevronDown } from '@/components/icons'

import { cn } from '@/lib/utils'

/**
 * 统一模型选择器的**触发器**（D2 ④ 画板「触发器 · 五处宿主同一形状」）。
 *
 * 一颗 32 高的胶囊：**模型名 + 型号 + 价 / 状态 + caret**。五处宿主（工作台桌面栏
 * 与手机 composer、画布节点、助手栏、配音间）用的是**同一颗**，⛔ 不按宿主改形状
 * —— 改了就又变回收口前那八套各长各样的选择器。
 *
 * 四态（画板逐格）：
 * | 态 | 右侧写什么 | 描边 |
 * | 默认 | 已选渠道的单价 | `border-border` |
 * | 先选渠道 | 「先选渠道」 | `border-status-warning` |
 * | 缺 key | 「缺 key」 | `border-status-warning` |
 * | 空 | 什么都不写（名字位写「选模型」） | `border-border` |
 *
 * ⚠ 状态字用 `text-status-warning`（#a04f00 / 暗色 #f0b25a），⛔ 不用 Tailwind 调色板
 * （ui-defaults §2.4）。⚠ 状态只在触发器上用**字**表达，绿 / 黄**点**只在渠道面板里
 * 出现（owner D2 Q1：「绿 / 黄点只在渠道面板」）。
 */
export interface ModelChipProps {
  /** 模型名（厂商系列，如 `Seedance`）。 */
  modelLabel: string
  /** 型号（如 `2.5`）；目录里拆不出来时不传。 */
  variantLabel?: string | null
  /** 右侧那一格写的字：单价、「先选渠道」、「缺 key」，或空态的 `null`。 */
  statusLabel?: string | null
  /** 右侧那一格是不是警告态（「先选渠道」/「缺 key」）。 */
  statusTone?: 'default' | 'warning'
  /** 弹层开着 / 当前被聚焦：描边收成前景色。 */
  active?: boolean
  disabled?: boolean
  /** 右侧的 caret。栏里只放一颗模型 chip 时可以关掉。 */
  showChevron?: boolean
  className?: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  ref?: React.Ref<HTMLButtonElement>
  /** 无障碍名字；不给则读 chip 上的字。 */
  'aria-label'?: string
}

export function ModelChip({
  modelLabel,
  variantLabel,
  statusLabel,
  statusTone = 'default',
  active = false,
  disabled = false,
  showChevron = true,
  className,
  onClick,
  ref,
  ...rest
}: ModelChipProps) {
  const warning = statusTone === 'warning'
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-model-chip
      data-active={active ? 'true' : undefined}
      data-status-tone={warning ? 'warning' : undefined}
      title={[modelLabel, variantLabel, statusLabel]
        .filter(Boolean)
        .join(' · ')}
      className={cn(
        'inline-flex h-8 min-w-0 max-w-60 items-center gap-2 rounded-full border pl-3 pr-2.5 text-2sm',
        'transition-colors duration-fast ease-standard motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-60',
        warning
          ? 'border-status-warning text-foreground'
          : active
            ? 'border-foreground text-foreground'
            : 'border-border text-foreground hover:border-foreground/40',
        className,
      )}
      {...rest}
    >
      <span className="truncate font-medium">{modelLabel}</span>
      {variantLabel ? (
        <span className="truncate text-muted-foreground">{variantLabel}</span>
      ) : null}
      {statusLabel ? (
        <span
          className={cn(
            'shrink-0 font-mono text-2xs tabular-nums',
            warning ? 'text-status-warning' : 'text-muted-foreground',
          )}
        >
          {statusLabel}
        </span>
      ) : null}
      {showChevron ? (
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
    </button>
  )
}
