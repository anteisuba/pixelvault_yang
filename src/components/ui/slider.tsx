'use client'

import * as React from 'react'
import { animate, useMotionValue, useReducedMotion } from 'motion/react'
import { Slider as SliderPrimitive } from 'radix-ui'

import { RUBBER_BAND, SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * 拖过头的橡皮筋（owner 2026-10-08 定「滑块拉长 B」用到全站参数滑块）：
 * 指针越过两端还往外拉，条顺着拉的方向被拉长、变细一点，圆钮跟着出去；松手弹回。
 * 中间正常拖 ⛔ 不变形。参数见 `RUBBER_BAND`（与前后对比的分隔线共用）。
 */
const STRETCH_RATIO = RUBBER_BAND.ratio
const STRETCH_MAX_PX = RUBBER_BAND.maxPx
/** 拉满时条的粗细只剩这么多（1 = 不变细）。 */
const STRETCH_MIN_THICKNESS = RUBBER_BAND.minThickness

interface SliderProps extends React.ComponentProps<
  typeof SliderPrimitive.Root
> {
  /** 拇指的额外样式。 */
  thumbClassName?: string
  /** 轨道的额外样式（高度 / 圆角 / 底色）。 */
  trackClassName?: string
  /** 已选填充的额外样式。 */
  rangeClassName?: string
  /**
   * 拖过头的橡皮筋，默认开。边画边调的工具（笔刷大小）和「看的范围」（时间线缩放）
   * 关掉 —— 它们不是参数，拉长只会分心。
   */
  stretch?: boolean
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbClassName,
  trackClassName,
  rangeClassName,
  stretch = true,
  orientation,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...props
}: SliderProps) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  )

  const reduceMotion = useReducedMotion()
  const elastic = stretch && orientation !== 'vertical' && !reduceMotion
  const rootRef = React.useRef<HTMLSpanElement>(null)
  const trackRef = React.useRef<HTMLSpanElement>(null)
  const dragging = React.useRef(false)
  /** 拉出去多少像素：正 = 右端往外，负 = 左端往外。 */
  const over = useMotionValue(0)

  React.useEffect(() => {
    if (!elastic) return
    return over.on('change', (px) => {
      const track = trackRef.current
      const root = rootRef.current
      if (!track || !root) return
      const width = track.offsetWidth || 1
      const pull = Math.abs(px)
      const thin =
        1 - (1 - STRETCH_MIN_THICKNESS) * Math.min(1, pull / STRETCH_MAX_PX)
      track.style.transformOrigin = px >= 0 ? 'left center' : 'right center'
      track.style.transform =
        pull < 0.01 ? '' : `scale(${1 + pull / width}, ${thin})`
      root
        .querySelectorAll<HTMLElement>('[data-slot="slider-thumb"]')
        .forEach((thumb) => {
          thumb.style.transform = pull < 0.01 ? '' : `translateX(${px}px)`
        })
    })
  }, [elastic, over])

  const pullFrom = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const beyond =
      clientX > rect.right
        ? clientX - rect.right
        : clientX < rect.left
          ? clientX - rect.left
          : 0
    over.set(
      Math.sign(beyond) *
        Math.min(STRETCH_MAX_PX, Math.abs(beyond) * STRETCH_RATIO),
    )
  }
  const release = () => {
    if (!dragging.current) return
    dragging.current = false
    animate(over, 0, SPRING.slot)
  }

  return (
    <SliderPrimitive.Root
      ref={rootRef}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      orientation={orientation}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (elastic && !props.disabled) dragging.current = true
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (elastic && dragging.current) pullFrom(event.clientX)
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        release()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        release()
      }}
      {...props}
    >
      <SliderPrimitive.Track
        ref={trackRef}
        data-slot="slider-track"
        className={cn(
          'relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
          trackClassName,
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            'absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
            rangeClassName,
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            'block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
            thumbClassName,
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
