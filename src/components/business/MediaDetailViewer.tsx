'use client'
/* eslint-disable @next/next/no-img-element -- transition overlay mirrors the clicked remote media */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { motionTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'

export interface MediaTransitionOrigin {
  x: number
  y: number
  width: number
  height: number
}

export interface MediaDetailNavigation {
  previousLabel: string
  nextLabel: string
  canGoPrevious: boolean
  canGoNext: boolean
  direction: -1 | 1
  onPrevious: () => void
  onNext: () => void
}

interface MediaDetailViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  closeLabel: string
  media: ReactNode
  mediaKey?: string
  sideHeader: ReactNode
  sideContent: ReactNode
  footerActions: ReactNode
  toolbarActions?: ReactNode
  navigation?: MediaDetailNavigation
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
  mediaKey,
  sideHeader,
  sideContent,
  footerActions,
  toolbarActions,
  navigation,
  thumbnails,
  overlayContent,
  transitionOrigin,
  transitionImageSrc,
  transitionImageAlt = '',
  mediaClassName,
  sideClassName,
}: MediaDetailViewerProps) {
  const mediaFrameRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
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

  useEffect(() => {
    if (!open || !navigation) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)))
      ) {
        return
      }

      if (event.key === 'ArrowLeft' && navigation.canGoPrevious) {
        event.preventDefault()
        navigation.onPrevious()
      } else if (event.key === 'ArrowRight' && navigation.canGoNext) {
        event.preventDefault()
        navigation.onNext()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigation, open])

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
              'relative flex h-[48dvh] min-h-80 shrink-0 items-center justify-center overflow-hidden bg-background px-3 pt-16 pb-5 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.08),transparent_34%)] before:content-[""] sm:px-6 lg:h-auto lg:min-h-0 lg:flex-1 lg:px-8 lg:py-16',
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

            <AnimatePresence
              initial={false}
              mode="popLayout"
              custom={navigation?.direction ?? 1}
            >
              <motion.div
                key={mediaKey ?? 'media'}
                ref={mediaFrameRef}
                custom={navigation?.direction ?? 1}
                variants={{
                  enter: (direction: -1 | 1) => ({
                    opacity: 0,
                    x: reducedMotion ? 0 : direction * 28,
                    scale: reducedMotion ? 1 : 0.985,
                  }),
                  center: { opacity: 1, x: 0, scale: 1 },
                  exit: (direction: -1 | 1) => ({
                    opacity: 0,
                    x: reducedMotion ? 0 : direction * -20,
                    scale: reducedMotion ? 1 : 0.99,
                  }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={motionTransition('base', reducedMotion)}
                className={cn(
                  'flex max-h-full max-w-full items-center justify-center',
                  hideMediaForTransition && 'opacity-0',
                )}
              >
                {media}
              </motion.div>
            </AnimatePresence>

            {navigation ? (
              <div className="pointer-events-none absolute inset-x-3 top-1/2 z-20 flex -translate-y-1/2 justify-between sm:inset-x-5 lg:inset-x-8">
                <Button
                  data-viewer-chrome
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={navigation.previousLabel}
                  disabled={!navigation.canGoPrevious}
                  onClick={navigation.onPrevious}
                  className="pointer-events-auto size-11 rounded-full border-border/70 bg-background/88 shadow-sm backdrop-blur-xl hover:bg-muted/70 disabled:opacity-30"
                >
                  <ChevronLeft className="size-5" />
                </Button>
                <Button
                  data-viewer-chrome
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={navigation.nextLabel}
                  disabled={!navigation.canGoNext}
                  onClick={navigation.onNext}
                  className="pointer-events-auto size-11 rounded-full border-border/70 bg-background/88 shadow-sm backdrop-blur-xl hover:bg-muted/70 disabled:opacity-30"
                >
                  <ChevronRight className="size-5" />
                </Button>
              </div>
            ) : null}

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
                  'calc(max(var(--keyboard-safe-area-bottom, 0px), var(--spacing) * 4) + var(--keyboard-inset, 0px))',
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
