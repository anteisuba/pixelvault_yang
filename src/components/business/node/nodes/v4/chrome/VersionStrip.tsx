'use client'

/**
 * 选中态卡下那条**版本缩略条**（图片卡方向 A「轻浮层」，spec §3，owner 2026-10-14）。
 *
 * 替代图片卡上的 `VersionDots`：一次出四张时，6px 小点看不出哪张好，挑图要先切过去
 * 才看得见。每版一颗 40 高缩略，当前版描深；点击或 ←→ 切换。还在出的那几张是转圈
 * 占位（`pendingCount`），出完一颗就换成图。
 *
 * 材质是玻璃：它只放缩略、不放字，属于 §1 第 12 条「只放图标的浮层」那一类。
 * 整条是一个 `radiogroup`，与小点同一套读屏语义。
 */

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { SPRING } from '@/constants/motion'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export interface VersionStripProps {
  /** 每一版的图地址，按版本顺序。 */
  readonly urls: readonly string[]
  /** 0-based。 */
  readonly current: number
  onSelect(index: number): void
  readonly ariaLabel: string
  /** 每一颗的可读名，如「第 2 版，共 3 版」。 */
  labelOf(index: number): string
  /** 这一轮还没回来的张数：排在末尾的转圈占位。 */
  readonly pendingCount?: number
  readonly className?: string
}

export function VersionStrip({
  urls,
  current,
  onSelect,
  ariaLabel,
  labelOf,
  pendingCount = 0,
  className,
}: VersionStripProps) {
  // 挂上之后才长出来的那几颗从 0 弹到原大（与小点同一颗 `spring-slot`）。
  const [mountedCount] = useState(urls.length)
  const reduceMotion = useReducedMotion()
  const listRef = useRef<HTMLDivElement>(null)

  // 当前版永远在看得见的地方：一排放不下时把它滚进来。
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-version-thumb="${current}"]`,
    )
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [current, urls.length])

  if (urls.length + pendingCount <= 1) return null

  const step = (delta: number) => {
    const next = current + delta
    if (next < 0 || next >= urls.length) return
    onSelect(next)
  }

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={ariaLabel}
      data-node-chrome="version-strip"
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
        'nodrag nopan nowheel flex max-w-96 items-center gap-1 overflow-x-auto rounded-node-thumb p-1 surface-glass shadow-node-chrome',
        className,
      )}
    >
      {urls.map((url, index) => {
        const active = index === current
        const fresh = index >= mountedCount && !reduceMotion
        return (
          <button
            key={`${index}-${url}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={labelOf(index)}
            data-version-thumb={index}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(index)}
            className={cn(
              'relative size-10 shrink-0 overflow-hidden rounded-lg transition-[box-shadow,transform] duration-fast ease-standard active:scale-96',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active
                ? 'ring-2 ring-foreground'
                : 'ring-1 ring-border hover:ring-foreground/40',
            )}
          >
            <motion.img
              src={url}
              alt=""
              draggable={false}
              initial={fresh ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING.slot}
              className="size-full object-cover"
            />
          </button>
        )
      })}
      {Array.from({ length: pendingCount }, (_, index) => (
        <span
          key={`pending-${index}`}
          aria-hidden
          data-version-thumb-pending
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-fill-track"
        >
          <Spinner className="size-4 text-muted-foreground" />
        </span>
      ))}
    </div>
  )
}
