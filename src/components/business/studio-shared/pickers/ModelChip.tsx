'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from '@/components/icons'
import { BlurSwap } from '@/components/ui/blur-swap'
import {
  DURATION,
  EASE_STANDARD,
  SPRING,
  motionTransition,
} from '@/constants/motion'

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
  /** 画布提示词栏专用的 28px 实底 chip。 */
  compact?: boolean
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
  compact = false,
  className,
  onClick,
  ref,
  ...rest
}: ModelChipProps) {
  const warning = statusTone === 'warning'
  const reduceMotion = useReducedMotion()
  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-model-chip
      data-active={active ? 'true' : undefined}
      data-status-tone={warning ? 'warning' : undefined}
      data-compact={compact || undefined}
      whileTap={compact && !reduceMotion ? { scale: 0.96 } : undefined}
      transition={SPRING.press}
      title={[modelLabel, variantLabel, statusLabel]
        .filter(Boolean)
        .join(' · ')}
      className={cn(
        compact
          ? 'inline-flex h-7 min-w-0 max-w-60 items-center gap-1 rounded-full bg-surface-fill px-2.5 text-xs text-foreground hover:bg-surface-fill-hover data-[active=true]:bg-surface-fill-track'
          : 'inline-flex h-8 min-w-0 max-w-60 items-center gap-2 rounded-full border pl-3 pr-2.5 text-2sm',
        'transition-colors duration-fast ease-standard motion-reduce:transition-none',
        compact
          ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-60',
        compact
          ? null
          : warning
            ? 'border-status-warning text-foreground'
            : active
              ? 'border-foreground text-foreground'
              : 'border-border text-foreground hover:border-foreground/40',
        className,
      )}
      {...rest}
    >
      {compact ? (
        <AnimatePresence initial={false}>
          <motion.span
            key={`${modelLabel}:${variantLabel ?? ''}`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.fast, ease: EASE_STANDARD }}
            className="inline-flex min-w-0 items-center gap-1 truncate"
          >
            <span className="truncate font-medium">{modelLabel}</span>
            {variantLabel ? (
              <span className="truncate text-muted-foreground">
                {variantLabel}
              </span>
            ) : null}
          </motion.span>
        </AnimatePresence>
      ) : (
        // 换模型（同系列多选、换系列）= 同一颗 chip 里的字糊一下换掉，宽度跟着字变。
        <BlurSwap
          swapKey={`${modelLabel}:${variantLabel ?? ''}`}
          className="min-w-0 gap-2"
        >
          <span className="truncate font-medium">{modelLabel}</span>
          {variantLabel ? (
            <span className="truncate text-muted-foreground">
              {variantLabel}
            </span>
          ) : null}
        </BlurSwap>
      )}
      {!compact && statusLabel ? (
        <BlurSwap
          swapKey={statusLabel}
          className={cn(
            'shrink-0 font-mono text-2xs tabular-nums',
            warning ? 'text-status-warning' : 'text-muted-foreground',
          )}
        >
          {statusLabel}
        </BlurSwap>
      ) : null}
      {showChevron ? (
        <motion.span
          aria-hidden
          animate={{ rotate: active ? 180 : 0 }}
          transition={motionTransition('base', reduceMotion)}
          className="inline-flex shrink-0 text-muted-foreground"
        >
          <ChevronDown className={compact ? 'size-3' : 'size-4'} />
        </motion.span>
      ) : null}
    </motion.button>
  )
}
