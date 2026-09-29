'use client'

/**
 * 展开态的**画中框**（spec §1.11，画板 `Expanded.dc.html` / `VideoExpanded.dc.html`）。
 *
 * 节点**原地不动**并保持选中环（那是 `NodeCardShell` 的事），框居中浮起、画布压暗；
 * 框顶**只有名字与关闭**——⛔ 没有全屏钮（owner 定：全屏是另一个模式，剪辑台才有）。
 * 框底两条插槽：这类节点自己的生成行（`footer`）与只属于写作助手的助手栏
 * （`assistantBar`），**两种模型不混**（spec §1.11 最后一句）。
 *
 * Esc / 点框外收起。开合 = 方向 A「从卡上长出来」（§1 第 12 条，`use-grow-from-origin`）：
 * 从 `origin` 那张卡的位置和大小放大到中间，关上缩回去；要播到关，调用方得把框包在
 * `AnimatePresence` 里（条件挂载那一处）。
 *
 * 宽度由调用方给：视频 720（`NODE_V4_CHROME.frameWidth.video`）。
 *
 * **收进屏幕**（画中框方向 A「一张纸」，owner 2026-09-29）：框最高 = 视口 − 上下各 48，
 * 内容多了在框里滚，顶栏与框底那两条钉住不动 —— ⛔ 让整页滚、把底下那条切到屏幕外
 * （owner 截图：写作助手那条只露出一半）。
 *
 * **两档形态**（`variant`）：`frame` = 上面那只画中框（视频卡）；`fullscreen` =
 * 铺满视口的**全屏文档**（文本卡，spec §2，owner 2026-09-11）——同一层压暗、同一
 * 条 Esc、同一个顶栏骨架，⛔ 不为文本卡另写一套浮层。全屏档忽略 `width`。
 *
 * ⚠ **自己 portal 到 `document.body`**：调用方是 ReactFlow 的节点元素（`transform`
 * 定位祖先），留在原地的话 `fixed` 压暗层会被那层 transform 关进卡里——真机
 * 2026-09-10 实拍到「压暗层只有一张卡那么大」。⛔ 不把这件事推回四类节点各自
 * `createPortal` 一次（S2 曾这么绕过，已删）。
 */

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { X } from '@/components/icons'

import { cn } from '@/lib/utils'

import { useGrowFromOrigin } from './use-grow-from-origin'

export interface NodeFrameProps {
  readonly open: boolean
  onClose(): void
  /** 顶栏那行名字。 */
  readonly title: string
  /** 顶栏名字与关闭之间的东西（文本节点的角色分段控件）。 */
  readonly titleExtra?: ReactNode
  /** 顶栏名字**之前**那颗（全屏文档的文件图标）。 */
  readonly titleLeading?: ReactNode
  /** 画中框宽；`fullscreen` 档忽略它。 */
  readonly width?: number
  /** 形态档（默认画中框）。 */
  readonly variant?: 'frame' | 'fullscreen'
  readonly children: ReactNode
  /** 框底第一条：这类节点自己的生成行 / 读数行。 */
  readonly footer?: ReactNode
  /** 框底最后一条：只属于写作助手（LLM）。 */
  readonly assistantBar?: ReactNode
  readonly ariaLabel?: string
  readonly className?: string
  /** 来处（那张卡）：框从它的位置和大小长出来、关上缩回它。 */
  readonly origin?: RefObject<HTMLElement | null>
}

export function NodeFrame(props: NodeFrameProps) {
  if (!props.open || typeof document === 'undefined') return null
  return createPortal(<NodeFrameLayer {...props} />, document.body)
}

function NodeFrameLayer({
  onClose,
  title,
  titleExtra,
  titleLeading,
  width,
  variant = 'frame',
  children,
  footer,
  assistantBar,
  ariaLabel,
  className,
  origin,
}: NodeFrameProps) {
  const t = useTranslations('StudioNode.v4.chrome')
  const box = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const { closing } = useGrowFromOrigin({
    origin,
    box,
    scrim,
    chrome: box,
    reduce: useReducedMotion() ?? false,
  })

  useEffect(() => {
    if (closing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closing, onClose])

  const fullscreen = variant === 'fullscreen'

  return (
    <div
      data-node-chrome="frame-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center',
        fullscreen ? 'p-0' : 'p-12',
        closing && 'pointer-events-none',
      )}
    >
      <div
        ref={scrim}
        aria-hidden
        data-node-chrome-scrim
        className="pointer-events-none fixed inset-0 bg-background/55"
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        data-node-chrome="frame"
        // ⚠ 框是 portal 到 `body` 的，但 **React 的事件仍沿组件树冒泡**回节点卡
        // ——框里双击（选词、连点播放器）会触发卡片自己的双击（展开 / 快速看）。
        // 2026-09-10 owner 真机反馈第三、五条的同一个根因，在这里一次挡住。
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          'relative flex max-h-full max-w-full flex-col border bg-card shadow-node-card-expanded',
          fullscreen ? 'h-full w-full' : 'rounded-node corner-squircle',
          className,
        )}
        style={fullscreen || width === undefined ? undefined : { width }}
      >
        <div
          data-grow-chrome
          className={cn(
            'flex h-12 shrink-0 items-center gap-3 pr-2.5 pl-5',
            fullscreen && 'h-11 border-b pr-2 pl-4',
          )}
        >
          {titleLeading}
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
        <div
          className={cn(
            'min-h-0 flex-1',
            fullscreen
              ? 'flex flex-col overflow-hidden'
              : 'overflow-y-auto px-5 pb-4',
          )}
        >
          {children}
        </div>
        {footer && (
          <div data-grow-chrome className="shrink-0 px-5 pb-2.5">
            {footer}
          </div>
        )}
        {assistantBar && (
          <div data-grow-chrome className="shrink-0 px-3 pb-3">
            {assistantBar}
          </div>
        )}
      </div>
    </div>
  )
}
