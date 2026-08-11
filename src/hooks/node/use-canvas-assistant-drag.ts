'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

const CANVAS_ASSISTANT_INSET_PX = 16
const CANVAS_ASSISTANT_KEYBOARD_STEP_PX = 24
const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [role="menuitem"], [role="option"], [data-assistant-no-drag]'

interface Point {
  x: number
  y: number
}

interface ActiveDrag {
  pointerId: number
  startClient: Point
  startOffset: Point
  panelRect: DOMRect
  boundaryRect: DOMRect
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getBoundaryRect(panel: HTMLElement): DOMRect {
  return (
    panel.closest<HTMLElement>('[data-canvas-workspace]') ??
    document.documentElement
  ).getBoundingClientRect()
}

function clampDelta(
  panelRect: DOMRect,
  boundaryRect: DOMRect,
  delta: Point,
): Point {
  const left = boundaryRect.left + CANVAS_ASSISTANT_INSET_PX
  const right = boundaryRect.right - CANVAS_ASSISTANT_INSET_PX
  const top = boundaryRect.top + CANVAS_ASSISTANT_INSET_PX
  const bottom = boundaryRect.bottom - CANVAS_ASSISTANT_INSET_PX

  return {
    x: clamp(delta.x, left - panelRect.left, right - panelRect.right),
    y: clamp(delta.y, top - panelRect.top, bottom - panelRect.bottom),
  }
}

/**
 * Keeps the canvas assistant's default geometry owned by CanvasWorkspaceLayout,
 * and layers a temporary transform on top while the user repositions it.
 */
export function useCanvasAssistantDrag(
  panelRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const offsetRef = useRef<Point>({ x: 0, y: 0 })
  const activeDragRef = useRef<ActiveDrag | null>(null)

  const applyOffset = useCallback(
    (next: Point) => {
      offsetRef.current = next
      const panel = panelRef.current
      if (panel) {
        panel.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
      }
    },
    [panelRef],
  )

  const keepPanelVisible = useCallback(() => {
    const panel = panelRef.current
    if (!panel || !enabled) return

    const correction = clampDelta(
      panel.getBoundingClientRect(),
      getBoundaryRect(panel),
      { x: 0, y: 0 },
    )
    if (correction.x === 0 && correction.y === 0) return

    applyOffset({
      x: offsetRef.current.x + correction.x,
      y: offsetRef.current.y + correction.y,
    })
  }, [applyOffset, enabled, panelRef])

  useEffect(() => {
    if (!enabled) {
      activeDragRef.current = null
      offsetRef.current = { x: 0, y: 0 }
      panelRef.current?.removeAttribute('data-dragging')
      panelRef.current?.style.removeProperty('transform')
      return
    }

    const frame = window.requestAnimationFrame(keepPanelVisible)
    window.addEventListener('resize', keepPanelVisible)
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(keepPanelVisible)
    if (panelRef.current) observer?.observe(panelRef.current)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', keepPanelVisible)
      observer?.disconnect()
    }
  }, [enabled, keepPanelVisible, panelRef])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const panel = panelRef.current
      if (!enabled || !panel || event.button !== 0) return
      const target = event.target
      if (
        target instanceof Element &&
        target !== event.currentTarget &&
        target.closest(INTERACTIVE_SELECTOR)
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      activeDragRef.current = {
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startOffset: offsetRef.current,
        panelRect: panel.getBoundingClientRect(),
        boundaryRect: getBoundaryRect(panel),
      }
      panel.dataset.dragging = 'true'
    },
    [enabled, panelRef],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = activeDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      event.preventDefault()
      event.stopPropagation()
      const delta = clampDelta(drag.panelRect, drag.boundaryRect, {
        x: event.clientX - drag.startClient.x,
        y: event.clientY - drag.startClient.y,
      })
      applyOffset({
        x: drag.startOffset.x + delta.x,
        y: drag.startOffset.y + delta.y,
      })
    },
    [applyOffset],
  )

  const finishPointerDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (activeDragRef.current?.pointerId !== event.pointerId) return
      activeDragRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      panelRef.current?.removeAttribute('data-dragging')
    },
    [panelRef],
  )

  const moveByKeyboard = useCallback(
    (delta: Point) => {
      const panel = panelRef.current
      if (!enabled || !panel) return
      const clamped = clampDelta(
        panel.getBoundingClientRect(),
        getBoundaryRect(panel),
        delta,
      )
      applyOffset({
        x: offsetRef.current.x + clamped.x,
        y: offsetRef.current.y + clamped.y,
      })
    },
    [applyOffset, enabled, panelRef],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return
      const deltaByKey: Partial<Record<string, Point>> = {
        ArrowLeft: { x: -CANVAS_ASSISTANT_KEYBOARD_STEP_PX, y: 0 },
        ArrowRight: { x: CANVAS_ASSISTANT_KEYBOARD_STEP_PX, y: 0 },
        ArrowUp: { x: 0, y: -CANVAS_ASSISTANT_KEYBOARD_STEP_PX },
        ArrowDown: { x: 0, y: CANVAS_ASSISTANT_KEYBOARD_STEP_PX },
      }
      const delta = deltaByKey[event.key]
      if (delta) {
        event.preventDefault()
        event.stopPropagation()
        moveByKeyboard(delta)
      } else if (event.key === 'Home') {
        event.preventDefault()
        event.stopPropagation()
        applyOffset({ x: 0, y: 0 })
      }
    },
    [applyOffset, moveByKeyboard],
  )

  return {
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointerDrag,
      onPointerCancel: finishPointerDrag,
      onKeyDown,
    },
  }
}
