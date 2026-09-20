'use client'

import { useEffect, useState } from 'react'

interface HomeV4TypewriterOptions {
  /** The line to type. Retyped from scratch if it changes (locale switch). */
  text: string
  /** Milliseconds per character. */
  stepMs: number
  /** Wait this long after `active` turns true before the first character. */
  delayMs: number
  /** True while the page that owns this typewriter is the one on screen. */
  active: boolean
  /**
   * Wait this long after leaving before clearing the line. Leaving is a slide,
   * not a cut — wiping the prompt on the spot plays the erase in full view.
   */
  resetMs: number
}

/**
 * The v4 home's typewriter: one character every `stepMs`, played on entry and
 * rewound on exit. Two feature pages type a prompt (01 图片 · 04 视频) and both
 * chain their next beat off the *end* of the typing rather than a wall-clock
 * offset — `text.length * stepMs` is that end, and it is a number the caller can
 * compute, which is why this hook only owns the text.
 *
 * That matters for i18n: the same beat lands at a different moment in each
 * locale, and a fixed offset would show results before the prompt was written.
 */
export function useHomeV4Typewriter({
  text,
  stepMs,
  delayMs,
  active,
  resetMs,
}: HomeV4TypewriterOptions): string {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!active) {
      const rewind = window.setTimeout(() => setTyped(''), resetMs)
      return () => window.clearTimeout(rewind)
    }

    let interval: number | undefined
    const start = window.setTimeout(() => {
      let index = 0
      interval = window.setInterval(() => {
        index += 1
        setTyped(text.slice(0, index))
        if (index >= text.length && interval !== undefined) {
          window.clearInterval(interval)
        }
      }, stepMs)
    }, delayMs)

    return () => {
      window.clearTimeout(start)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [active, delayMs, resetMs, stepMs, text])

  return typed
}
