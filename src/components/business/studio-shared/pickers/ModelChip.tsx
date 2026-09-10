'use client'

import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 提示词栏上的**模型 chip**（`node-canvas-v2.md` §1.5 / §1.6）。
 *
 * 只显示**型号名**；渠道是自动选的，所以平时不写 —— 只有用户**手改过渠道**时
 * 才附「· fal」，让「我改过」这件事有回执。它本身不认识模型清单，是
 * `ModelPickerPopover` 的默认触发器，也可以被节点提示词栏单独摆。
 */
export interface ModelChipProps {
  /** 型号名，已去掉渠道后缀（`groupModelsForPicker` 算好的那个）。 */
  modelLabel: string
  /** 手改过渠道时的渠道名；自动选中的渠道**不要传**。 */
  channelLabel?: string | null
  /** 弹层开着 / 当前被聚焦：chip 变成实心描边。 */
  active?: boolean
  disabled?: boolean
  /** 右侧的 ▾。栏里只放一颗模型 chip 时可以关掉。 */
  showChevron?: boolean
  className?: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  ref?: React.Ref<HTMLButtonElement>
  /** 无障碍名字；不给则读 chip 上的字。 */
  'aria-label'?: string
}

export function ModelChip({
  modelLabel,
  channelLabel,
  active = false,
  disabled = false,
  showChevron = true,
  className,
  onClick,
  ref,
  ...rest
}: ModelChipProps) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-model-chip
      data-active={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-6 max-w-full shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs',
        'transition-colors duration-fast ease-standard motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-60',
        active
          ? 'border-foreground text-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
        className,
      )}
      {...rest}
    >
      <span className="truncate">{modelLabel}</span>
      {channelLabel ? (
        <span className="shrink-0 text-muted-foreground">· {channelLabel}</span>
      ) : null}
      {showChevron ? (
        <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
      ) : null}
    </button>
  )
}
