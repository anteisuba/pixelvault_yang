'use client'

import {
  useCallback,
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react'

import { RUBBER_BAND, SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/** 方向键一下挪多少（占全宽的比例）。 */
const KEY_STEP = 0.05

interface ImageCompareProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  beforeSrc: string
  afterSrc: string
  beforeLabel: string
  afterLabel: string
  /** 分隔线的读屏名（「拖动对比修改前后」）。 */
  sliderLabel: string
  /** 两张图共用的尺寸约束（例：编辑舞台的 `studio-edit-media` 高度上限）。 */
  mediaClassName?: string
}

/**
 * 前后对比（动效样片 W，owner 2026-10-08）：「修改后」铺底、「修改前」压在上面按分隔线
 * 裁掉右半；分隔线左右拖。拖过两端还往外拉时线被拉出去一点、变细（与参数滑块同一根
 * 橡皮筋 `RUBBER_BAND`，样片 B），松手 `SPRING.slot` 弹回边上。
 *
 * - 只动 `clip-path` 与 `transform`；图本身不重排。
 * - 键盘：分隔线是 `role="slider"`，←/→ 每次 5%，Home/End 到两端。
 * - `prefers-reduced-motion` 下不拉长、松手直接回边。
 */
export function ImageCompare({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
  sliderLabel,
  mediaClassName,
  className,
  ...props
}: ImageCompareProps) {
  const reduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  /** 分隔线位置，占全宽的比例（0–1）。 */
  const fraction = useMotionValue(0.5)
  /** 拉过头多少像素：负 = 左端往外，正 = 右端往外。 */
  const over = useMotionValue(0)

  const clip = useTransform(
    fraction,
    (value) => `inset(0 ${(1 - value) * 100}% 0 0)`,
  )
  const left = useTransform(fraction, (value) => `${value * 100}%`)
  const lineScaleY = useTransform(over, (px) => {
    const pull = Math.min(1, Math.abs(px) / RUBBER_BAND.maxPx)
    return 1 - (1 - RUBBER_BAND.minThickness) * pull * 0.25
  })
  const lineScaleX = useTransform(over, (px) => {
    const pull = Math.min(1, Math.abs(px) / RUBBER_BAND.maxPx)
    return 1 - (1 - RUBBER_BAND.minThickness) * pull
  })

  // aria-valuenow 跟着读数走，⛔ 每帧重渲：直接写属性。
  const handleRef = useRef<HTMLDivElement>(null)
  useMotionValueEvent(fraction, 'change', (value) => {
    handleRef.current?.setAttribute(
      'aria-valuenow',
      String(Math.round(value * 100)),
    )
  })

  const moveTo = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const raw = clientX - rect.left
      const clamped = Math.max(0, Math.min(rect.width, raw))
      fraction.set(clamped / rect.width)
      if (reduceMotion) return
      const beyond = raw - clamped
      over.set(
        Math.sign(beyond) *
          Math.min(RUBBER_BAND.maxPx, Math.abs(beyond) * RUBBER_BAND.ratio),
      )
    },
    [fraction, over, reduceMotion],
  )

  const release = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    if (reduceMotion) over.jump(0)
    else animate(over, 0, SPRING.slot)
  }, [over, reduceMotion])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    moveTo(event.clientX)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(event.clientX)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = fraction.get()
    const next =
      event.key === 'ArrowLeft'
        ? current - KEY_STEP
        : event.key === 'ArrowRight'
          ? current + KEY_STEP
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 1
              : null
    if (next === null) return
    event.preventDefault()
    const clamped = Math.max(0, Math.min(1, next))
    if (reduceMotion) fraction.jump(clamped)
    else animate(fraction, clamped, SPRING.slot)
  }

  return (
    <div
      ref={containerRef}
      data-slot="image-compare"
      className={cn(
        'relative inline-block max-w-full cursor-col-resize touch-none overflow-hidden rounded-xl select-none',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      {...props}
    >
      {/* 修改后铺底，撑出整块的尺寸。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className={cn('block max-w-full object-contain', mediaClassName)}
        draggable={false}
      />
      {/* 修改前压在上面，按分隔线裁掉右半。 */}
      <motion.div
        className="absolute inset-0"
        style={{ clipPath: clip }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt=""
          className="size-full object-contain"
          draggable={false}
        />
      </motion.div>

      <motion.div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label={sliderLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 w-6 -translate-x-1/2 focus-visible:outline-none"
        style={{ left, x: over }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-background"
          style={{ scaleX: lineScaleX, scaleY: lineScaleY }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-foreground/60 shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-ring"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M4 3L1 7L4 11M10 3L13 7L10 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </motion.div>

      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-foreground/70 px-2.5 py-1 text-3xs font-semibold text-background">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-foreground/70 px-2.5 py-1 text-3xs font-semibold text-background">
        {afterLabel}
      </span>
    </div>
  )
}
