'use client'

import { useEffect } from 'react'

const HEADER_SELECTOR = '.homepage-header'
const HERO_SELECTOR = '.homepage-hero-window'

/**
 * Toggles the marketing header between its "over-hero" and "scrolled" states.
 * The header sits directly above the dark hero, so over the hero it goes solid
 * dark (same tone as the hero) and the two read as one continuous dark zone;
 * once the hero scrolls past, it becomes the light bar over the ivory page.
 *
 * No-JS / pre-hydration fallback is the light bar (see homepage.css), so the
 * header is always legible even if this never runs.
 */
export function HomepageHeaderMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(HEADER_SELECTOR)
    const hero = document.querySelector(HERO_SELECTOR)
    if (!header || !hero) return

    const apply = (overHero: boolean) => {
      header.dataset.headerState = overHero ? 'hero' : 'scrolled'
    }

    // Best-guess for the first painted frame (page almost always loads at top).
    apply(window.scrollY < 120)

    const observer = new IntersectionObserver(
      ([entry]) => apply(entry.isIntersecting),
      { rootMargin: '-64px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(hero)

    return () => observer.disconnect()
  }, [])

  return null
}
