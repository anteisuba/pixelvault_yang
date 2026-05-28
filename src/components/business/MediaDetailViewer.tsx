'use client'
/* eslint-disable @next/next/no-img-element -- transition overlay mirrors the clicked remote media */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface MediaTransitionOrigin {
  x: number
  y: number
  width: number
  height: number
}

interface MediaDetailViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  closeLabel: string
  media: ReactNode
  sideHeader: ReactNode
  sideContent: ReactNode
  footerActions: ReactNode
  toolbarActions?: ReactNode
  thumbnails?: ReactNode
  overlayContent?: ReactNode
  transitionOrigin?: MediaTransitionOrigin | null
  transitionImageSrc?: string | null
  transitionImageAlt?: string
  mediaClassName?: string
  sideClassName?: string
}

interface TransitionOverlayState {
  rect: MediaTransitionOrigin
  ready: boolean
}

const VIEWER_TRANSITION_MS = 340

export function toMediaTransitionOrigin(rect: DOMRect): MediaTransitionOrigin {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

export function MediaDetailViewer({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  media,
  sideHeader,
  sideContent,
  footerActions,
  toolbarActions,
  thumbnails,
  overlayContent,
  transitionOrigin,
  transitionImageSrc,
  transitionImageAlt = '',
  mediaClassName,
  sideClassName,
}: MediaDetailViewerProps) {
  const mediaFrameRef = useRef<HTMLDivElement>(null)
  const [transitionOverlay, setTransitionOverlay] =
    useState<TransitionOverlayState | null>(null)
  const [hideMediaForTransition, setHideMediaForTransition] = useState(false)

  const canTransition = useMemo(
    () => Boolean(transitionOrigin && transitionImageSrc),
    [transitionImageSrc, transitionOrigin],
  )

  useLayoutEffect(() => {
    if (!open || !canTransition || !transitionOrigin || !transitionImageSrc) {
      return
    }

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const target = mediaFrameRef.current
    if (!target || reduceMotion) return

    const targetRect = target.getBoundingClientRect()
    const nextRect = toMediaTransitionOrigin(targetRect)

    let moveFrameId = 0
    const startFrameId = window.requestAnimationFrame(() => {
      setHideMediaForTransition(true)
      setTransitionOverlay({ rect: transitionOrigin, ready: false })
      moveFrameId = window.requestAnimationFrame(() => {
        setTransitionOverlay({ rect: nextRect, ready: true })
      })
    })
    const timerId = window.setTimeout(() => {
      setTransitionOverlay(null)
      setHideMediaForTransition(false)
    }, VIEWER_TRANSITION_MS + 60)

    return () => {
      window.cancelAnimationFrame(startFrameId)
      window.cancelAnimationFrame(moveFrameId)
      window.clearTimeout(timerId)
      setTransitionOverlay(null)
      setHideMediaForTransition(false)
    }
  }, [canTransition, open, transitionImageSrc, transitionOrigin])

  const handleMediaBackdropClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }

    if (mediaFrameRef.current?.contains(target)) {
      return
    }

    if (target instanceof Element && target.closest('[data-viewer-chrome]')) {
      return
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 top-0 left-0 z-50 max-h-none max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-background p-0 text-foreground shadow-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        ) : null}

        <div className="relative h-dvh w-full overflow-y-auto bg-background lg:flex lg:flex-row lg:overflow-hidden">
          <section
            onClick={handleMediaBackdropClick}
            className={cn(
              'relative flex h-[48dvh] min-h-80 shrink-0 items-center justify-center overflow-hidden bg-background px-3 pt-16 pb-5 before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.08),transparent_34%)] before:content-[""] sm:px-6 lg:h-auto lg:min-h-0 lg:flex-1 lg:px-8 lg:py-16',
              mediaClassName,
            )}
          >
            <div className="pointer-events-none absolute top-3 right-3 left-3 z-30 flex items-center justify-end gap-2 sm:top-5 sm:right-5 sm:left-auto">
              {toolbarActions ? (
                <div
                  data-viewer-chrome
                  className="pointer-events-auto flex min-w-0 items-center gap-2 overflow-x-auto rounded-full border border-border/70 bg-background/88 p-1 shadow-sm backdrop-blur-xl"
                >
                  {toolbarActions}
                </div>
              ) : null}
              <DialogClose asChild>
                <Button
                  data-viewer-chrome
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={closeLabel}
                  className="size-10 rounded-full border-border/70 bg-background/88 shadow-sm backdrop-blur-xl hover:bg-muted/70"
                >
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </div>

            <div
              ref={mediaFrameRef}
              className={cn(
                'flex max-h-full max-w-full items-center justify-center transition-opacity duration-150',
                hideMediaForTransition && 'opacity-0',
              )}
            >
              {media}
            </div>

            {thumbnails ? (
              <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-20 flex justify-center lg:right-5 lg:bottom-auto lg:left-auto lg:top-1/2 lg:-translate-y-1/2 lg:flex-col">
                <div data-viewer-chrome className="pointer-events-auto">
                  {thumbnails}
                </div>
              </div>
            ) : null}
          </section>

          <aside
            className={cn(
              'flex shrink-0 flex-col border-t border-border/70 bg-card/96 shadow-sm lg:h-dvh lg:w-[420px] lg:border-t-0 lg:border-l xl:w-[480px]',
              sideClassName,
            )}
          >
            <div className="shrink-0 border-b border-border/60 px-5 py-4 sm:px-6">
              {sideHeader}
            </div>
            <div className="px-5 py-5 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {sideContent}
            </div>
            <div
              className="shrink-0 border-t border-border/70 bg-card/98 px-5 py-4 sm:px-6"
              style={{
                paddingBottom:
                  'max(env(safe-area-inset-bottom), var(--spacing) * 4)',
              }}
            >
              {footerActions}
            </div>
          </aside>
        </div>

        {transitionOverlay && transitionImageSrc ? (
          <img
            src={transitionImageSrc}
            alt={transitionImageAlt}
            className={cn(
              'pointer-events-none fixed z-[70] rounded-2xl object-cover shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              transitionOverlay.ready && 'object-contain',
            )}
            style={{
              left: transitionOverlay.rect.x,
              top: transitionOverlay.rect.y,
              width: transitionOverlay.rect.width,
              height: transitionOverlay.rect.height,
            }}
          />
        ) : null}
        {overlayContent}
      </DialogContent>
    </Dialog>
  )
}
