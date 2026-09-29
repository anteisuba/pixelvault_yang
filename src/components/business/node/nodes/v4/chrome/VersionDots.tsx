'use client'

/**
 * 选中态卡下那一排**版本小点**（spec §1.8，画板 `ImageSelected.dc.html`）。
 *
 * 每版都是 6px 圆点；点击或 ←→ 切换。⛔ 不显示序号数字
 * ——读数（`2 / 3 · 1792×1024`）是快速看那一层的事。
 *
 * 整排是一个 `radiogroup`：一排看不出语义的点，屏幕阅读器只能靠角色与 `aria-label`
 * 认出「这是版本」。
 */

import { cn } from '@/lib/utils'

export interface VersionDotsProps {
  readonly count: number
  /** 0-based。 */
  readonly current: number
  onSelect(index: number): void
  readonly ariaLabel: string
  /** 每一颗的可读名，如「第 2 版，共 3 版」。 */
  labelOf(index: number): string
  readonly className?: string
}

export function VersionDots({
  count,
  current,
  onSelect,
  ariaLabel,
  labelOf,
  className,
}: VersionDotsProps) {
  if (count <= 1) return null

  const step = (delta: number) => {
    const next = current + delta
    if (next < 0 || next >= count) return
    onSelect(next)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-node-chrome="version-dots"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          step(-1)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          step(1)
        }
      }}
      className={cn(
        'nodrag nopan flex h-2.5 items-center justify-center',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => {
        const active = index === current
        return (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={labelOf(index)}
            data-version-dot={index}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(index)}
            className={cn(
              // 12px 按键相邻，中央各 6px 圆点的可见间距正好 6px；高度保持 24px 命中区。
              'flex h-6 w-3 shrink-0 items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'block size-1.5 rounded-full',
                active ? 'bg-foreground' : 'bg-surface-fill-track',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
