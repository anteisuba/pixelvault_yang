'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { animate, usePresence } from 'motion/react'

import {
  DURATION,
  DURATION_MS,
  EASE_IN,
  EASE_STANDARD,
} from '@/constants/motion'

export const GROW_CLOSE_MS = DURATION_MS.fast * 2

type AnimationControl = {
  complete(): void
  stop(): void
  readonly finished: Promise<void>
}

interface FlipTransform {
  readonly x: number
  readonly y: number
  readonly scaleX: number
  readonly scaleY: number
}

interface GrowFromOriginOptions {
  readonly origin?: RefObject<HTMLElement | null> | undefined
  readonly box: RefObject<HTMLElement | null>
  readonly scrim: RefObject<HTMLElement | null>
  readonly chrome?: RefObject<HTMLElement | null>
  readonly stretchFromOrigin?: boolean
  readonly reduce: boolean
}

function originRect(origin: RefObject<HTMLElement | null> | undefined) {
  const element = origin?.current
  return (
    element?.querySelector<HTMLElement>('[data-node-card-surface]') ?? element
  )?.getBoundingClientRect()
}

function flipFrom(
  origin: DOMRect,
  box: DOMRect,
  stretch: boolean,
): FlipTransform {
  const x = origin.left - box.left
  const y = origin.top - box.top
  const scaleX = Math.max(origin.width / box.width, 0.05)
  const scaleY = stretch ? Math.max(origin.height / box.height, 0.05) : scaleX
  return { x, y, scaleX, scaleY }
}

const FALLBACK_ORIGIN: FlipTransform = {
  x: 0,
  y: 0,
  scaleX: 0.96,
  scaleY: 0.96,
}

export function useGrowFromOrigin({
  origin,
  box,
  scrim,
  chrome,
  stretchFromOrigin = false,
  reduce,
}: GrowFromOriginOptions): { readonly closing: boolean } {
  const [isPresent, safeToRemove] = usePresence()
  const release = useRef(safeToRemove)
  const entrance = useRef<AnimationControl[]>([])
  const openedFrom = useRef<FlipTransform | null>(null)

  useLayoutEffect(() => {
    release.current = safeToRemove
  })

  useLayoutEffect(() => {
    const boxElement = box.current
    if (!boxElement) return
    const scrimElement = scrim.current
    const chromeElements = chrome?.current
      ? Array.from(
          chrome.current.querySelectorAll<HTMLElement>('[data-grow-chrome]'),
        )
      : []
    const duration = reduce ? 0.001 : DURATION.slow
    const fromRect = originRect(origin)
    const from = fromRect
      ? flipFrom(
          fromRect,
          boxElement.getBoundingClientRect(),
          stretchFromOrigin,
        )
      : FALLBACK_ORIGIN
    openedFrom.current = from

    const running: AnimationControl[] = [
      animate(
        boxElement,
        reduce
          ? { opacity: [0, 1] }
          : {
              x: [from.x, 0],
              y: [from.y, 0],
              scaleX: [from.scaleX, 1],
              scaleY: [from.scaleY, 1],
              opacity: [0.5, 1],
            },
        { duration, ease: EASE_STANDARD },
      ),
    ]
    if (scrimElement) {
      running.push(
        animate(
          scrimElement,
          { opacity: [0, 1] },
          {
            duration: reduce ? 0.001 : DURATION.base,
            ease: EASE_STANDARD,
          },
        ),
      )
    }
    for (const element of chromeElements) {
      running.push(
        animate(
          element,
          { opacity: [0, 0, 1] },
          {
            duration,
            times: [0, 0.375, 1],
            ease: 'linear',
          },
        ),
      )
    }
    entrance.current = running

    return () => {
      for (const control of running) control.stop()
      for (const element of [boxElement, scrimElement, ...chromeElements]) {
        element?.style.removeProperty('transform')
        element?.style.removeProperty('opacity')
      }
      entrance.current = []
    }
  }, [box, chrome, origin, reduce, scrim, stretchFromOrigin])

  useEffect(() => {
    if (isPresent) return
    const boxElement = box.current
    if (!boxElement) {
      release.current?.()
      return
    }
    for (const control of entrance.current) control.complete()
    boxElement.style.removeProperty('transform')
    boxElement.style.removeProperty('opacity')
    const scrimElement = scrim.current
    const chromeElements = chrome?.current
      ? Array.from(
          chrome.current.querySelectorAll<HTMLElement>('[data-grow-chrome]'),
        )
      : []
    const toRect = originRect(origin)
    const to = toRect
      ? flipFrom(toRect, boxElement.getBoundingClientRect(), stretchFromOrigin)
      : (openedFrom.current ?? FALLBACK_ORIGIN)
    const duration = reduce ? 0.001 : GROW_CLOSE_MS / 1000
    const running: AnimationControl[] = [
      animate(
        boxElement,
        reduce
          ? { opacity: [1, 0] }
          : {
              x: [0, to.x],
              y: [0, to.y],
              scaleX: [1, to.scaleX],
              scaleY: [1, to.scaleY],
              opacity: [1, 0.4],
            },
        { duration, ease: EASE_IN },
      ),
    ]
    if (scrimElement) {
      running.push(
        animate(
          scrimElement,
          { opacity: [1, 0] },
          {
            duration,
            ease: EASE_IN,
          },
        ),
      )
    }
    for (const element of chromeElements) {
      running.push(
        animate(
          element,
          { opacity: [1, 0] },
          {
            duration: reduce ? 0.001 : DURATION.fast,
            ease: 'linear',
          },
        ),
      )
    }
    let cancelled = false
    void Promise.allSettled(running.map((control) => control.finished)).then(
      () => {
        if (!cancelled) release.current?.()
      },
    )
    return () => {
      cancelled = true
      for (const control of running) control.stop()
    }
  }, [box, chrome, isPresent, origin, reduce, scrim, stretchFromOrigin])

  return { closing: !isPresent }
}
