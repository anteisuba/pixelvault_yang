'use client'

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
        className="pointer-events-none absolute inset-0 bg-foreground/24"
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
              documentFrame ? 'text-sm' : 'text-md',
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
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
