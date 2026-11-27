'use client'
/* eslint-disable @next/next/no-img-element -- accordion slices render remote gallery/R2 thumbnails */

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import {
  IMAGE_ACCORDION_MOTION,
  stepDampedSpring,
  type DampedSpringState,
} from '@/constants/motion'
import { cn } from '@/lib/utils'

export interface ImageAccordionItem {
  id: string
  src: string
  alt: string
  label?: string
  active?: boolean
}

interface ImageAccordionProps {
  items: readonly ImageAccordionItem[]
  onSelect?: (id: string) => void
  ariaLabel?: string
  className?: string
}

function targetWeightsFor(
  items: readonly ImageAccordionItem[],
  focusedIndex: number | null,
): number[] {
  const sigma = 0.35 + (IMAGE_ACCORDION_MOTION.reach / 100) * 0.9
  if (focusedIndex !== null) {
    return items.map((_, index) =>
      Math.exp(-((Math.abs(index - focusedIndex) / sigma) ** 2)),
    )
  }
  const activeIndex = items.findIndex((item) => item.active)
  if (activeIndex >= 0) {
    return items.map(
      (_, index) =>
        0.5 * Math.exp(-((Math.abs(index - activeIndex) / sigma) ** 2)),
    )
  }
  return items.map(() => 0)
}

/**
 * 高斯邻域衰减照片手风琴（吸收自 Bencho `#2 Image Accordion`）：
 * 指针悬停或键盘聚焦某一张时，以 `exp(-(|i - focus| / σ)²)` 的高斯场平滑扩散给邻近项，
 * 用 60Hz 归一化阻尼弹簧驱动每张切片的 `flex-grow`（全程 DOM ref 直写，零重渲染）。
 */
export function ImageAccordion({
  items,
  onSelect,
  ariaLabel,
  className,
}: ImageAccordionProps) {
  const reducedMotion = Boolean(useReducedMotion())
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const sliceRefs = useRef<(HTMLButtonElement | null)[]>([])
  const springsRef = useRef<DampedSpringState[]>([])

  const targets = targetWeightsFor(items, focusedIndex)
  const targetsKey = targets.map((value) => value.toFixed(4)).join(',')
  const itemCount = items.length

  useEffect(() => {
    const expandGain = 0.4 + (IMAGE_ACCORDION_MOTION.open / 100) * 2.8
    const parsedTargets = targetsKey
      ? targetsKey.split(',').map((token) => Number(token))
      : []

    // 对齐弹簧数组长度，保留既有速度与位置实现顺滑打断。
    while (springsRef.current.length < itemCount) {
      springsRef.current.push({ val: 0, vel: 0 })
    }
    if (springsRef.current.length > itemCount) {
      springsRef.current.length = itemCount
    }

    const applyGrow = () => {
      for (let i = 0; i < itemCount; i += 1) {
        const el = sliceRefs.current[i]
        const spring = springsRef.current[i]
        if (!el || !spring) continue
        el.style.flexGrow = (1 + expandGain * spring.val).toFixed(4)
      }
    }

    if (reducedMotion) {
      for (let i = 0; i < itemCount; i += 1) {
        const spring = springsRef.current[i]
        if (spring) {
          spring.val = parsedTargets[i] ?? 0
          spring.vel = 0
        }
      }
      applyGrow()
      return
    }

    let rafId = 0
    let lastTime = performance.now()
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const now = performance.now()
      const rawDt = now - lastTime
      const dtMs = rawDt > 0 ? rawDt : 16.67
      lastTime = now
      let allSettled = true

      for (let i = 0; i < itemCount; i += 1) {
        const spring = springsRef.current[i]
        if (!spring) continue
        const settled = stepDampedSpring(
          spring,
          parsedTargets[i] ?? 0,
          dtMs,
          IMAGE_ACCORDION_MOTION.speed,
        )
        if (!settled) allSettled = false
      }

      applyGrow()
      if (!allSettled) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [itemCount, reducedMotion, targetsKey])

  if (items.length === 0) return null

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="image-accordion"
      onMouseLeave={() => setFocusedIndex(null)}
      className={cn('flex h-20 w-full gap-1.5', className)}
    >
      {items.map((item, index) => {
        const emphasized =
          focusedIndex === index ||
          (focusedIndex === null && Boolean(item.active))
        return (
          <button
            key={item.id}
            ref={(el) => {
              sliceRefs.current[index] = el
            }}
            type="button"
            data-slot="image-accordion-slice"
            data-active={item.active ? 'true' : 'false'}
            aria-pressed={item.active}
            aria-label={item.label ? `${item.label} · ${item.alt}` : item.alt}
            onMouseEnter={() => setFocusedIndex(index)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() =>
              setFocusedIndex((current) => (current === index ? null : current))
            }
            onClick={() => onSelect?.(item.id)}
            className={cn(
              'relative min-w-0 flex-1 basis-0 overflow-hidden rounded-lg bg-muted text-left transition-shadow duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
              item.active
                ? 'ring-2 ring-foreground ring-inset'
                : 'ring-1 ring-border ring-inset',
            )}
          >
            <img
              src={item.src}
              alt={item.alt}
              draggable={false}
              className="size-full object-cover"
            />
            {item.label ? (
              <span
                className={cn(
                  'pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-full bg-black/65 px-1.5 py-0.5 text-2xs font-semibold text-white backdrop-blur-xs transition-opacity duration-fast ease-standard',
                  emphasized ? 'opacity-100' : 'opacity-0',
                )}
              >
                {item.label}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
