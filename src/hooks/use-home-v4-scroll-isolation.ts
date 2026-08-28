'use client'

import { useCallback } from 'react'

/** Gestures the deck listens for on `window`, in the order they arrive. */
const ISOLATED_EVENTS = [
  'wheel',
  'touchstart',
  'touchmove',
  'touchend',
] as const

/**
 * Keep a scrollable region's wheel and touch gestures away from the paging deck.
 *
 * `HomeV4Deck` listens for `wheel` / `touchstart` / `touchend` on `window` and
 * turns the page, and the wheel listener calls `preventDefault()`. Anything the
 * deck contains that scrolls on its own — the price list's columns, the mobile
 * detail sheet — would therefore be unscrollable: every notch would page the
 * deck instead. Stopping propagation inside the region is the whole fix. The
 * deck's listener never runs, so it never calls `preventDefault()`, so the
 * browser scrolls the region natively.
 *
 * Deliberately unconditional rather than 「release at the edge」: the deck is
 * `overflow: hidden`, so a wheel tick that overshoots the bottom of a list has
 * nowhere to chain to anyway, and 「one more notch also turns the page」 is a
 * far worse surprise than 「the list stops at its end」.
 *
 * The listeners are `passive` — this hook never calls `preventDefault()`, and
 * saying so lets the browser start scrolling without waiting on us.
 *
 * ⚠ The region also needs `touch-action` in CSS: `body.home-v4-locked` sets
 * `touch-action: none` on phones, and no JavaScript can undo that.
 *
 * Returns a *ref callback* rather than a ref plus an effect: a region that
 * mounts and unmounts (the sheet) then binds and unbinds with the node itself,
 * and there is no effect ordering to get wrong. React 19 calls the returned
 * function on detach, which is why there is no bookkeeping here.
 */
export function useHomeV4ScrollIsolation<T extends HTMLElement>() {
  return useCallback((node: T) => {
    const stop = (event: Event) => event.stopPropagation()
    for (const name of ISOLATED_EVENTS) {
      node.addEventListener(name, stop, { passive: true })
    }

    return () => {
      for (const name of ISOLATED_EVENTS) {
        node.removeEventListener(name, stop)
      }
    }
  }, [])
}
