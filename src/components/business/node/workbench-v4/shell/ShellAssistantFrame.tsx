'use client'

/**
 * 助手 dock 的**几何外壳**（S7 §7 助手 · 画板 `ChromeAssistant.dc.html`）：
 * 右侧 dock 可拖宽（320–520）、可收成一条。
 *
 * ⚠ 只管宽度与收放，⛔ 不碰会话：dock 本体仍是 `StudioNodeAssistantDock`，
 * 它作为 `children` 原样挂进来。
 *
 * ⚠ 桌面档才给宽度：手机上 dock 是贴底抽屉（`inset-x-0`），钉一个 px 宽会把它
 * 拦腰截断 —— 所以宽度由调用方按 `isMobile` 决定给不给。
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_ASSISTANT } from '@/constants/canvas-shell'

export interface ShellAssistantFrameProps {
  /** dock 开着。`false` 时只可能剩右缘那一条（`showStrip`）。 */
  readonly open: boolean
  /** 收起后右缘那一条 —— 从没开过时不显示（画板默认态右缘是空的）。 */
  readonly showStrip: boolean
  /** `undefined` = 不钉宽（手机档）。 */
  readonly width: number | undefined
  onWidthChange(next: number): void
  onOpen(): void
  readonly children: ReactNode
}

export function ShellAssistantFrame({
  open,
  showStrip,
  width,
  onWidthChange,
  onOpen,
  children,
}: ShellAssistantFrameProps) {
  const t = useTranslations('StudioNode.shell.assistantDock')
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const latestWidth = useRef(width ?? CANVAS_SHELL_ASSISTANT.defaultWidthPx)
  useEffect(() => {
    latestWidth.current = width ?? CANVAS_SHELL_ASSISTANT.defaultWidthPx
  }, [width])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      dragRef.current = {
        startX: event.clientX,
        startWidth: latestWidth.current,
      }
      const onMove = (moveEvent: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        // 往左拖 = 变宽（dock 贴右缘），所以差值取反。
        const next = drag.startWidth + (drag.startX - moveEvent.clientX)
        onWidthChange(
          Math.min(
            CANVAS_SHELL_ASSISTANT.maxWidthPx,
            Math.max(CANVAS_SHELL_ASSISTANT.minWidthPx, Math.round(next)),
          ),
        )
      }
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onWidthChange],
  )

  if (!open) {
    if (!showStrip) return null
    return (
      <button
        type="button"
        data-testid="shell-assistant-strip"
        aria-label={t('expand')}
        title={t('expand')}
        onClick={onOpen}
        className="canvas-glass pointer-events-auto absolute bottom-0 right-0 top-0 hidden w-2 rounded-full lg:block"
      >
        <ChevronLeft className="sr-only" aria-hidden />
      </button>
    )
  }

  // 手机档不钉宽：dock 自己就是贴底抽屉，包一层定宽的盒子只会把它截断。
  if (width === undefined) return <>{children}</>

  return (
    <div
      data-testid="shell-assistant-frame"
      style={{ width }}
      className="pointer-events-none absolute bottom-0 right-0 top-0"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('resize')}
        data-testid="shell-assistant-resize"
        onPointerDown={onPointerDown}
        className="pointer-events-auto absolute -left-1 top-1/2 hidden h-14 w-2 -translate-y-1/2 cursor-col-resize rounded-full bg-node-panel-inner lg:block"
      />
      {children}
    </div>
  )
}
