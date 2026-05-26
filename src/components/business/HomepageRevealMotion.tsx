'use client'

import { useEffect } from 'react'

const MOTION_READY_CLASS = 'homepage-motion-ready'
const VISIBLE_CLASS = 'homepage-reveal-visible'
const REVEAL_SELECTOR = '[data-homepage-reveal]'

function isInInitialViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight
  return rect.top < viewportHeight * 0.92 && rect.bottom > 0
}

export function HomepageRevealMotion() {
  useEffect(() => {
    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )

    if (reducedMotionQuery.matches) return

    const root = document.documentElement
    const elements = Array.from(document.querySelectorAll(REVEAL_SELECTOR))

    if (elements.length === 0) return

    for (const element of elements) {
      if (isInInitialViewport(element)) {
        element.classList.add(VISIBLE_CLASS)
      }
    }

    root.classList.add(MOTION_READY_CLASS)

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue

          entry.target.classList.add(VISIBLE_CLASS)
          observer.unobserve(entry.target)
        }
      },
      {
        rootMargin: '0px 0px -14% 0px',
        threshold: 0.12,
      },
    )

    for (const element of elements) {
      if (!element.classList.contains(VISIBLE_CLASS)) {
        observer.observe(element)
      }
    }

    return () => {
      observer.disconnect()
      root.classList.remove(MOTION_READY_CLASS)
    }
  }, [])

  return null
}
