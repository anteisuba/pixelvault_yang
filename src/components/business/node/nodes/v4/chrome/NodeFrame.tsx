'use client'

/**
 * 展开态的**画中框**（spec §1.11，画板 `Expanded.dc.html` / `VideoExpanded.dc.html`）。
 *
 * 节点**原地不动**并保持选中环（那是 `NodeCardShell` 的事），框居中浮起、画布压暗；
 * 框顶**只有名字与关闭**——⛔ 没有全屏钮（owner 定：全屏是另一个模式，剪辑台才有）。
 * 框底两条插槽：这类节点自己的生成行（`footer`）与只属于写作助手的助手栏
 * （`assistantBar`），**两种模型不混**（spec §1.11 最后一句）。
 *
 * Esc / 点框外收起；进出走 `spring-expand`（ui-defaults §4.1：卡展开是「物体在
 * 原地长大」，线性缓动会读成面板切换）。
 *
 * 宽度由调用方给：文本 640 / 视频 720（`NODE_V4_CHROME.frameWidth`）。
 */

import { useEffect, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface NodeFrameProps {
  readonly open: boolean
  onClose(): void
  /** 顶栏那行名字。 */
  readonly title: string
  /** 顶栏名字与关闭之间的东西（文本节点的角色分段控件）。 */
  readonly titleExtra?: ReactNode
  readonly width: number
  readonly children: ReactNode
  /** 框底第一条：这类节点自己的生成行 / 读数行。 */
  readonly footer?: ReactNode
  /** 框底最后一条：只属于写作助手（LLM）。 */
  readonly assistantBar?: ReactNode
  readonly ariaLabel?: string
  readonly className?: string
}

export function NodeFrame({
  open,
  onClose,
  title,
  titleExtra,
  width,
  children,
  footer,
  assistantBar,
  ariaLabel,
  className,
}: NodeFrameProps) {
  const t = useTranslations('StudioNode.v4.chrome')

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      data-node-chrome="frame-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/55 p-10"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        data-node-chrome="frame"
        className={cn(
          'flex max-w-full flex-col rounded-node corner-squircle border bg-card shadow-node-card-expanded',
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 duration-spring-expand ease-spring-expand',
          className,
        )}
        style={{ width }}
      >
        <div className="flex h-12 shrink-0 items-center gap-3 pr-2.5 pl-5">
          <h2 className="min-w-0 flex-1 truncate text-2sm font-semibold tracking-node-title">
            {title}
          </h2>
          {titleExtra}
          <button
            type="button"
            aria-label={t('close')}
            data-node-frame-close
            onClick={onClose}
            className="flex size-8.5 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-surface-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 px-8 pb-5">{children}</div>
        {footer && <div className="shrink-0 px-5 pb-2.5">{footer}</div>}
        {assistantBar && (
          <div className="shrink-0 px-3 pb-3">{assistantBar}</div>
        )}
      </div>
    </div>
  )
}
