'use client'

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { X } from '@/components/icons'

import { cn } from '@/lib/utils'

import {
  NODE_CHROME_SCRIM_CLASS,
  useGrowFromOrigin,
} from './use-grow-from-origin'

export interface NodeFrameProps {
  readonly open: boolean
  onClose(): void
  readonly title: string
  readonly titleExtra?: ReactNode
  readonly titleLeading?: ReactNode
  readonly titleActions?: ReactNode
  readonly width?: number
  readonly variant?: 'frame' | 'document'
  readonly stretchFromOrigin?: boolean
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly assistantBar?: ReactNode
  readonly ariaLabel?: string
  readonly className?: string
  readonly origin?: RefObject<HTMLElement | null>
  /**
   * 框底让出的高（替掉默认的 48 底留白）：图 / 视频卡点开后，底部那条停靠的提示词栏
   * 照常在场，框得停在它上面。不给 = 四边一样留白。
   */
  readonly bottomInsetPx?: number
}

export function NodeFrame(props: NodeFrameProps) {
  if (!props.open || typeof document === 'undefined') return null
  const originElement = props.origin?.current
  const stage = originElement
    ? originElement.closest<HTMLElement>('[data-canvas-stage]')
    : props.origin
      ? document.querySelector<HTMLElement>('[data-canvas-stage]')
      : null
  return createPortal(
    <NodeFrameLayer {...props} withinStage={stage !== null} />,
    stage ?? document.body,
  )
}

function NodeFrameLayer({
  onClose,
  title,
  titleExtra,
  titleLeading,
  titleActions,
  width,
  variant = 'frame',
  stretchFromOrigin = false,
  children,
  footer,
  assistantBar,
  ariaLabel,
  className,
  origin,
  bottomInsetPx,
  withinStage,
}: NodeFrameProps & { readonly withinStage: boolean }) {
  const t = useTranslations('StudioNode.v4.chrome')
  const box = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const { closing } = useGrowFromOrigin({
    origin,
    box,
    scrim,
    chrome: box,
    stretchFromOrigin,
    reduce: useReducedMotion() ?? false,
  })

  useEffect(() => {
    if (closing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Esc 一次只退一层：框里的下拉 / 弹层（Radix 在捕获阶段关自己并 preventDefault）、
      // 提示词栏的 @ / 候选与失焦先吃掉这一下，⛔ 不连框一起关。
      if (event.defaultPrevented || event.isComposing) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closing, onClose])

  const documentFrame = variant === 'document'

  return (
    <div
      data-node-chrome="frame-scrim"
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      style={
        bottomInsetPx === undefined
          ? undefined
          : { paddingBottom: bottomInsetPx }
      }
      className={cn(
        'inset-0 flex items-center justify-center p-12',
        withinStage ? 'absolute z-canvas-panel' : 'fixed z-50',
        closing && 'pointer-events-none',
      )}
    >
      <div
        ref={scrim}
        aria-hidden
        data-node-chrome-scrim
        className={cn(
          'pointer-events-none absolute inset-0',
          NODE_CHROME_SCRIM_CLASS,
        )}
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        data-node-chrome="frame"
        data-node-frame-variant={variant}
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          'relative flex max-h-full max-w-full origin-top-left flex-col overflow-hidden rounded-node border bg-card shadow-node-card-expanded',
          documentFrame && 'h-full',
          className,
        )}
        style={width === undefined ? undefined : { width }}
      >
        <div
          data-grow-chrome
          data-node-frame-header
          className={cn(
            'flex h-13 shrink-0 items-center gap-2.5 pr-3 pl-5',
            documentFrame && 'border-b',
          )}
        >
          {titleLeading}
          <h2
            className={cn(
              'min-w-0 truncate font-semibold tracking-node-title',
              documentFrame ? 'text-2sm' : 'text-md',
            )}
          >
            {title}
          </h2>
          {titleExtra}
          <span className="min-w-0 flex-1" />
          {titleActions}
          <button
            type="button"
            aria-label={t('close')}
            data-node-frame-close
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div
          data-node-frame-body
          className={cn(
            'min-h-0 flex-1',
            documentFrame
              ? 'flex flex-col overflow-hidden'
              : 'overflow-y-auto px-5',
          )}
        >
          {children}
        </div>
        {footer && (
          <div
            data-grow-chrome
            data-node-frame-footer
            className="shrink-0 border-t pt-3 pr-4 pb-3.5 pl-5"
          >
            {footer}
          </div>
        )}
        {assistantBar && (
          <div
            data-grow-chrome
            data-node-frame-assistant
            className={cn(
              'shrink-0 empty:hidden',
              documentFrame ? 'flex justify-center px-5 pb-4' : 'px-5 pb-4',
            )}
          >
            {assistantBar}
          </div>
        )}
      </div>
    </div>
  )
}
