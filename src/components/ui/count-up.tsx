'use client'

import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'

import { COUNT_UP_SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * **数出来的读数**（owner 2026-10-08 设置页原型 v1「用量」）：挂上时从 0 弹簧滚到
 * `value`，之后值变了从当前读数滚到新值。与 `RollingNumber`（逐位滚轴、首次不滚）是
 * 两件事：这里要的正是「进来时数一遍」。
 *
 * - `format` 每帧都调，⚠ 传模块级函数（内联函数每次渲染都是新的，会从头再数一遍）。
 * - 读屏只念终值：滚动那份 `aria-hidden`，旁边一份 `sr-only`。
 * - `prefers-reduced-motion` 下直接停在终值。
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number
  format: (value: number) => string
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const nodeRef = useRef<HTMLSpanElement>(null)
  const shownRef = useRef(0)

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return
    if (reduceMotion) {
      shownRef.current = value
      node.textContent = format(value)
      return
    }
    const controls = animate(shownRef.current, value, {
      ...COUNT_UP_SPRING,
      onUpdate: (latest) => {
        shownRef.current = latest
        node.textContent = format(Math.max(0, latest))
      },
    })
    return () => controls.stop()
  }, [format, reduceMotion, value])

  return (
    <span className={cn('tabular-nums', className)}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden ref={nodeRef} data-testid="count-up-visual">
        {format(0)}
      </span>
    </span>
  )
}
