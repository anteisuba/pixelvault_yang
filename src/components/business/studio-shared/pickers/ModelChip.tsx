'use client'

import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * 提示词栏上的**模型 chip**（`node-canvas-v2.md` §1.5 / §1.6）。
 *
 * chip 上**只有型号名**（2026-09-10 owner 真机反馈第六条：带上「· 渠道」之后
 * 三颗 chip 加发送键在 380 的栏里出框）。手改过的渠道退到 `title` 上当回执，
 * 弹层里那一行的对勾仍然写着它。名字最长 160，超了省略；chip 本身**可被压缩**
 * ——栏窄时依次省略，⛔ 不横向滚动。
 *
 * 它本身不认识模型清单，是 `ModelPickerPopover` 的默认触发器，也可以被节点提示词
 * 栏单独摆。
 */
export interface ModelChipProps {
  /** 型号名，已去掉渠道后缀（`groupModelsForPicker` 算好的那个）。 */
  modelLabel: string
  /** 手改过渠道时的渠道名 —— 只进 `title`，⛔ 不画在 chip 上。 */
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
      title={channelLabel ? `${modelLabel} · ${channelLabel}` : modelLabel}
      className={cn(
        'inline-flex min-h-6 min-w-0 max-w-40 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs',
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
      {showChevron ? (
        <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
      ) : null}
    </button>
  )
}
