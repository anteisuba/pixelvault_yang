'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** 两指距离变了这么多倍才算一档（张开 ×1.2 / 捏拢 ÷1.2）。 */
const PINCH_STEP_RATIO = 1.2

/**
 * 双指捏合换档（手机素材页格子大小，owner 2026-10-09 选「双指捏合」）：张开 = `+1`、
 * 捏拢 = `-1`，每跨一档重新起算，一次捏合可以连跨几档。
 *
 * 两指落在元素上时接管手势（`touchmove` 拦掉，整页不缩放）；一根手指照常滚动。
 * `onActiveChange` 报手势起止，宿主据此露出 / 收起档位指示。
 */
export function usePinchStep(
  ref: RefObject<HTMLElement | null>,
  {
    enabled,
    onStep,
    onActiveChange,
  }: {
    enabled: boolean
    onStep: (direction: 1 | -1) => void
    onActiveChange?: (active: boolean) => void
  },
) {
  const handlers = useRef({ onStep, onActiveChange })
  useEffect(() => {
    handlers.current = { onStep, onActiveChange }
  })

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    let base: number | null = null

    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      )

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      base = distance(event.touches)
      handlers.current.onActiveChange?.(true)
    }
    const onMove = (event: TouchEvent) => {
      if (base === null || event.touches.length !== 2) return
      event.preventDefault()
      const current = distance(event.touches)
      if (current > base * PINCH_STEP_RATIO) {
        base = current
        handlers.current.onStep(1)
      } else if (current < base / PINCH_STEP_RATIO) {
        base = current
        handlers.current.onStep(-1)
      }
    }
    const onEnd = (event: TouchEvent) => {
      if (base === null || event.touches.length >= 2) return
      base = null
      handlers.current.onActiveChange?.(false)
    }
    // iOS Safari 另发一套 gesture 事件：不拦它会整页缩放。
    const onGesture = (event: Event) => event.preventDefault()

    element.addEventListener('touchstart', onStart, { passive: true })
    element.addEventListener('touchmove', onMove, { passive: false })
    element.addEventListener('touchend', onEnd)
    element.addEventListener('touchcancel', onEnd)
    element.addEventListener('gesturestart', onGesture)
    return () => {
      element.removeEventListener('touchstart', onStart)
      element.removeEventListener('touchmove', onMove)
      element.removeEventListener('touchend', onEnd)
      element.removeEventListener('touchcancel', onEnd)
      element.removeEventListener('gesturestart', onGesture)
    }
  }, [ref, enabled])
}
