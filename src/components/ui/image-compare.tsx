'use client'

import {
  useCallback,
  useEffect,
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
  useSpring,
  useTransform,
} from 'motion/react'

import { COMPARE_JELLY_SPRING, RUBBER_BAND, SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/** 方向键一下挪多少（占全宽的比例）。 */
const KEY_STEP = 0.05
/** 低于该像素弯曲量时退回直线裁切，避免静止时走 SVG path。 */
const BEND_THRESHOLD_PX = 0.25

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

function computeJellyCurve(
  fraction: number,
  endsFraction: number,
  width: number,
  height: number,
  reducedMotion: boolean,
): { edgeX: number; ctrlX: number; active: boolean } {
  if (reducedMotion || width <= 0 || height <= 0) {
    return { edgeX: 0, ctrlX: 0, active: false }
  }
  const midX = fraction * width
  const endsX = endsFraction * width
  const rawBend = midX - endsX
  // 靠近左右边缘时平滑衰减弯曲幅度，让位给边界橡皮筋 stretch。
  const edgeHeadroom = Math.min(midX, width - midX) * 0.9
  const maxBend = Math.min(COMPARE_JELLY_SPRING.maxBendPx, edgeHeadroom)
  const bend = Math.max(-maxBend, Math.min(maxBend, rawBend))
  if (Math.abs(bend) < BEND_THRESHOLD_PX) {
    return { edgeX: midX, ctrlX: midX, active: false }
  }
  const edgeX = Math.max(0, Math.min(width, midX - bend))
  const ctrlX = midX + bend
  return { edgeX, ctrlX, active: true }
}

/**
 * 前后对比（动效样片 W + 果冻弹性分隔线）：「修改后」铺底、「修改前」压在上面按分隔线
 * 裁掉右半；分隔线左右拖。快速拖动时上下两端弹簧轻微滞后、形成二次贝塞尔果冻弧线，
 * 拖过两端还往外拉时线被拉出去一点、变细（与参数滑块同一根橡皮筋 `RUBBER_BAND`），
 * 松手 `SPRING.slot` 弹回边上。
 *
 * - 只动 `clip-path`、SVG 路径与 `transform`；图本身不重排。
 * - 键盘：分隔线是 `role="slider"`，←/→ 每次 5%，Home/End 到两端。
 * - `prefers-reduced-motion` 下保持直线、不弯曲不拉长、松手直接回边。
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
  const reduceMotion = Boolean(useReducedMotion())
  const containerRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const dragging = useRef(false)
  /** 分隔线中心位置，占全宽的比例（0–1）。 */
  const fraction = useMotionValue(0.5)
  /** 分隔线上下两端的滞后弹簧，与 fraction 的差值驱动果冻弯曲。 */
  const endsFraction = useSpring(fraction, {
    stiffness: COMPARE_JELLY_SPRING.stiffness,
    damping: COMPARE_JELLY_SPRING.damping,
  })
  /** 拉过头多少像素：负 = 左端往外，正 = 右端往外。 */
  const over = useMotionValue(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const syncSize = () => {
      const rect = el.getBoundingClientRect()
      sizeRef.current = { w: rect.width, h: rect.height }
    }
    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const clip = useTransform([fraction, endsFraction], ([f, ef]) => {
    const frac = Number(f)
    const endsFrac = Number(ef)
    const { w, h } = sizeRef.current
    const curve = computeJellyCurve(frac, endsFrac, w, h, reduceMotion)
    if (!curve.active) {
      return `inset(0 ${(1 - frac) * 100}% 0 0)`
    }
    const xe = curve.edgeX.toFixed(2)
    const xc = curve.ctrlX.toFixed(2)
    const halfH = (h / 2).toFixed(2)
    const fullH = h.toFixed(2)
    return `path("M0 0 L${xe} 0 Q${xc} ${halfH} ${xe} ${fullH} L0 ${fullH} Z")`
  })

  const curvePath = useTransform([fraction, endsFraction], ([f, ef]) => {
    const { w, h } = sizeRef.current
    const curve = computeJellyCurve(Number(f), Number(ef), w, h, reduceMotion)
    if (!curve.active) return ''
    const xe = curve.edgeX.toFixed(2)
    const xc = curve.ctrlX.toFixed(2)
    return `M ${xe} 0 Q ${xc} ${(h / 2).toFixed(2)} ${xe} ${h.toFixed(2)}`
  })

  const straightLineOpacity = useTransform(
    [fraction, endsFraction],
    ([f, ef]) => {
      const { w, h } = sizeRef.current
      const curve = computeJellyCurve(Number(f), Number(ef), w, h, reduceMotion)
      return curve.active ? 0 : 1
    },
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

  // aria-valuenow 与果冻弧线 SVG `d` 属性直接写入 DOM，⛔ 每帧重渲。
  const handleRef = useRef<HTMLDivElement>(null)
  const curvePathRef = useRef<SVGPathElement>(null)
  useMotionValueEvent(fraction, 'change', (value) => {
    handleRef.current?.setAttribute(
      'aria-valuenow',
      String(Math.round(value * 100)),
    )
  })
  useMotionValueEvent(curvePath, 'change', (d) => {
    curvePathRef.current?.setAttribute('d', d)
  })

  const moveTo = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      sizeRef.current = { w: rect.width, h: rect.height }
      const raw = clientX - rect.left
      const clamped = Math.max(0, Math.min(rect.width, raw))
      const nextFraction = clamped / rect.width
      fraction.set(nextFraction)
      if (reduceMotion) {
        endsFraction.jump(nextFraction)
        return
      }
      const beyond = raw - clamped
      over.set(
        Math.sign(beyond) *
          Math.min(RUBBER_BAND.maxPx, Math.abs(beyond) * RUBBER_BAND.ratio),
      )
    },
    [endsFraction, fraction, over, reduceMotion],
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
    if (reduceMotion) {
      fraction.jump(clamped)
      endsFraction.jump(clamped)
    } else {
      animate(fraction, clamped, SPRING.slot)
    }
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
      {/* 修改前压在上面，按分隔线裁掉右半（快速拖动时自动切换果冻二次贝塞尔裁切）。 */}
      <motion.div
        data-slot="image-compare-before"
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

      {/* 果冻弯曲态的 SVG 弧线分隔线；静止或 reduced-motion 时路径为空，由下方直线承接。 */}
      <svg
        aria-hidden
        data-slot="image-compare-curve"
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        <path
          ref={curvePathRef}
          d=""
          fill="none"
          strokeWidth={2}
          className="stroke-background"
        />
      </svg>

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
          style={{
            scaleX: lineScaleX,
            scaleY: lineScaleY,
            opacity: straightLineOpacity,
          }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-foreground/60 shadow-sm transition-transform duration-fast ease-tactile group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-ring"
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

      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-3xs font-semibold text-white">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-3xs font-semibold text-white">
        {afterLabel}
      </span>
    </div>
  )
}
