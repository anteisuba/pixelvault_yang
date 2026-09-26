'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'

import { LIQUID_SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

export interface LiquidSegmentedItem<T extends string> {
  readonly value: T
  readonly label: string
}

interface LiquidSegmentedProps<T extends string> {
  items: readonly LiquidSegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}

function measure(items: Map<string, HTMLButtonElement>, target: string) {
  const item = items.get(target)
  return item
    ? { left: item.offsetLeft, right: item.offsetLeft + item.offsetWidth }
    : null
}

const ITEM_CLASS =
  'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1 text-2xs font-medium'

/**
 * 液态分段（owner 2026-09-26：「视频里那个效果」）。
 *
 * 选中块的**两条边各一根弹簧**：往哪边走，那一边是硬的 `lead`、身后那条是软的
 * `trail`，所以途中被拉长、到站再收拢 —— 一个物体在走，⛔ 不是两颗按钮换色。
 * 选中块是一整层铺满、按两条边裁出来的实底，里面再排一遍同样的字（反色），于是
 * 字是被扫过的那一瞬逐像素变色的。
 *
 * ⚠ 两层字必须同字重同内边距：宽度差一个像素，扫过时字就会抖。
 * ⚠ 位置只在「值变了」或「几何变了」时动：父组件在动画途中重渲染不能把它打回终点。
 */
export function LiquidSegmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: LiquidSegmentedProps<T>) {
  const reducedMotion = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const left = useMotionValue(0)
  const right = useMotionValue(0)
  const width = useMotionValue(0)
  const clipPath = useTransform(
    () =>
      `inset(0 ${width.get() - right.get()}px 0 ${left.get()}px round 999px)`,
  )
  /** 上一次落定的值与它的几何 —— 用来分辨「换了选中」与「只是重排了」。 */
  const placed = useRef<{ value: T; left: number; right: number } | null>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    const target = measure(itemRefs.current, value)
    if (!box || !target) return
    if (box.offsetWidth !== width.get()) width.jump(box.offsetWidth)

    const previous = placed.current
    placed.current = { value, ...target }
    if (!previous || reducedMotion) {
      left.jump(target.left)
      right.jump(target.right)
      return
    }
    if (previous.value === value) {
      // 同一个选中、几何变了（加了一页 / 字变了）：原地挪过去，不演。
      if (previous.left !== target.left || previous.right !== target.right) {
        left.jump(target.left)
        right.jump(target.right)
      }
      return
    }
    const rightward =
      (target.left + target.right) / 2 > (left.get() + right.get()) / 2
    animate(
      right,
      target.right,
      rightward ? LIQUID_SPRING.lead : LIQUID_SPRING.trail,
    )
    animate(
      left,
      target.left,
      rightward ? LIQUID_SPRING.trail : LIQUID_SPRING.lead,
    )
  })

  // 容器自己变宽变窄（窗口缩放、字体晚到）时跟着落位。
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      width.jump(box.offsetWidth)
      const current = placed.current
      if (!current) return
      const target = measure(itemRefs.current, current.value)
      if (!target) return
      placed.current = { value: current.value, ...target }
      left.jump(target.left)
      right.jump(target.right)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [left, right, width])

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 rounded-full border border-border bg-muted p-0.5',
        'has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background',
        disabled && 'opacity-50',
        className,
      )}
    >
      <div ref={boxRef} className="relative flex">
        {items.map((item) => (
          <button
            key={item.value}
            ref={(node) => {
              if (node) itemRefs.current.set(item.value, node)
              else itemRefs.current.delete(item.value)
            }}
            type="button"
            role="tab"
            aria-selected={item.value === value}
            disabled={disabled}
            onClick={() => {
              if (item.value !== value) onChange(item.value)
            }}
            className={cn(
              ITEM_CLASS,
              'text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none disabled:pointer-events-none',
            )}
          >
            {item.label}
          </button>
        ))}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex rounded-full bg-foreground"
          style={{ clipPath }}
        >
          {items.map((item) => (
            <span
              key={item.value}
              className={cn(ITEM_CLASS, 'text-background')}
            >
              {item.label}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
