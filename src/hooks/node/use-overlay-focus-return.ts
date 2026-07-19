'use client'

import { useEffect, useRef } from 'react'

/**
 * Captures whatever element has focus the moment `active` flips to `true`,
 * then returns focus to it (best-effort — a no-op if that element has since
 * left the DOM) once `active` flips back to `false`. The restore is deferred
 * one frame so the closing element's own unmount/re-render settles first.
 *
 * Shared by the canvas overlay ladder (canvas-relationship-v3 §4.2 "焦点还
 * 原") — one call per boolean overlay-open signal (add menu / 详情面板 / 卡匣
 * 展开), each instance independently tracking its own open/close edge.
 */
export function useOverlayFocusReturn(active: boolean): void {
  const triggerRef = useRef<HTMLElement | null>(null)
  const wasActiveRef = useRef(false)

  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = active

    if (active && !wasActive) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      return
    }

    if (active || !wasActive) return

    const trigger = triggerRef.current
    triggerRef.current = null
    if (!trigger) return

    const frameId = window.requestAnimationFrame(() => {
      if (document.contains(trigger)) trigger.focus()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [active])
}
