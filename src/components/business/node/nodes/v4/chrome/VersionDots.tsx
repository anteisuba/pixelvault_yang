'use client'

/**
 * 选中态卡下那一排**版本小点**（spec §1.8，画板 `ImageSelected.dc.html`）。
 *
 * 当前版拉长成一颗胶囊，其余是 6px 圆点；点击或 ←→ 切换。⛔ 不显示序号数字
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
      className={cn('nodrag nopan flex items-center gap-1.25', className)}
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
              // 命中区靠上下 padding 撑到 AA 底线，视觉仍是 6px 的点。
              'flex h-6 items-center px-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'block h-1.5 rounded-full transition-[width,background-color] duration-spring-slot ease-spring-slot',
                // ⚠ 对比度（`contrast-check`，2026-09-10）：小点是**信息性图形**
                // （「一共几版」只有它在说），门槛 3:1。`foreground/25` 只有
                // 1.78（卡面）/ 1.77（画布底），⛔ 不要改回去；`/45` = 3.15 / 3.10。
                // 当前那颗是实心 `foreground` = 19.80。
                active ? 'w-4.5 bg-foreground' : 'w-1.5 bg-foreground/45',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
