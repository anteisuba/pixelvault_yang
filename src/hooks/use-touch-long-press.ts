'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** 按住多久算长按（同系统相册的手感）。 */
const LONG_PRESS_MS = 450
/** 手指挪过这么远就当是在滚动，不算长按。 */
const LONG_PRESS_SLOP_PX = 10

/**
 * 触屏长按（手机素材页「长按一张进多选」，owner 2026-10-09）。iOS 不为触屏发
 * `contextmenu`，所以自己计时；鼠标、触控笔不走这里（桌面右键照旧）。
 *
 * - `bind(key)` 挂到一格上；按住到时调 `onLongPress(key)` 并轻震一下。
 * - 长按之后紧跟的那一下 `click`（iOS）或 `contextmenu`（Android）要吞掉：调用方
 *   先问 `swallow()`，返回 true 就什么都不做（只吞一次）。
 */
export function useTouchLongPress<K>(onLongPress: (key: K) => void) {
  const callback = useRef(onLongPress)
  useEffect(() => {
    callback.current = onLongPress
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef({ x: 0, y: 0 })
  const fired = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const bind = useCallback(
    (key: K) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        fired.current = false
        if (event.pointerType !== 'touch' || !event.isPrimary) return
        cancel()
        origin.current = { x: event.clientX, y: event.clientY }
        timer.current = setTimeout(() => {
          timer.current = null
          fired.current = true
          navigator.vibrate?.(10)
          callback.current(key)
        }, LONG_PRESS_MS)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        if (!timer.current) return
        const dx = event.clientX - origin.current.x
        const dy = event.clientY - origin.current.y
        if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
    }),
    [cancel],
  )

  const swallow = useCallback(() => {
    const was = fired.current
    fired.current = false
    return was
  }, [])

  return { bind, swallow }
}
