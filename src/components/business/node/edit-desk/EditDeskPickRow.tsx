'use client'

/**
 * 弹层里的一行一项（换皮第二轮，照模型选择器定稿）：紧凑、字少、一行一项；选中的整行
 * 变成浅灰块加对勾。悬停只描 1px 边 —— 与模型选择器同一条：悬停也换底会和选中撞成
 * 一个样子。
 *
 * 对勾不跳：没选中时它在原位**糊着、缩小、透明**，选中时由糊变清、弹回原大（slot 档
 * 弹簧，一点点过冲）。点下去对勾立刻挪过去，弹层停一会儿再收（`EDIT_PICK_CLOSE_DELAY_MS`）。
 */

import type { ReactNode } from 'react'
import { Check } from '@/components/icons'

import { cn } from '@/lib/utils'

/** 弹层头一行：粗体名字在左，这是哪一段 / 怎么用在右。 */
export function PickHeader({
  title,
  hint,
}: {
  readonly title: string
  readonly hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2 pt-1 pb-1.5">
      <b className="shrink-0 text-xs font-semibold text-foreground">{title}</b>
      {hint ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

/** 一组单选行。 */
export function PickList({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-0.5">
      {children}
    </div>
  )
}

export function PickRow({
  label,
  selected,
  onPick,
  onHover,
  leading,
  detail,
  mono = false,
  testId,
}: {
  readonly label: ReactNode
  readonly selected: boolean
  onPick(): void
  /** 鼠标停上这一行（版本对比用）。 */
  onHover?(): void
  /** 行首的小图（版本缩略）。 */
  readonly leading?: ReactNode
  /** 名字右边的灰字（时长 · 来源）。 */
  readonly detail?: ReactNode
  /** 名字本身是读数（`2×`、`0.3s`）：走等宽槽。 */
  readonly mono?: boolean
  readonly testId?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      onClick={onPick}
      onPointerEnter={onHover}
      onFocus={onHover}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-xs text-foreground',
        'transition-colors duration-fast ease-standard motion-reduce:transition-none',
        'hover:outline hover:outline-1 hover:outline-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-muted',
      )}
    >
      {leading}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          mono && 'font-mono tabular-nums',
        )}
      >
        {label}
      </span>
      {detail ? (
        <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
          {detail}
        </span>
      ) : null}
      <Check
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 transition duration-spring-slot ease-spring-slot motion-reduce:transition-none',
          selected
            ? 'scale-100 opacity-100 blur-none'
            : 'scale-40 opacity-0 blur-xs',
        )}
      />
    </button>
  )
}
