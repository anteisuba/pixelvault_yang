'use client'

import { IconContext } from '@phosphor-icons/react'

/**
 * Global Phosphor defaults.
 *
 * `weight: 'regular'` — the interface spec (ui-spec.md §7, owner 2026-10-24)
 * draws every icon in the regular 16/256 stroke, the lighter line that sits
 * with 13px UI text. It replaces the earlier `bold` default, which only existed
 * to match the stroke of the lucide set the app shipped before Phosphor. Fills
 * (a saved bookmark) stay per call site via `weight="fill"`.
 *
 * Size is only a fallback: every call site sizes with a `size-*` class, which
 * wins over the context value.
 */
const ICON_DEFAULTS = {
  weight: 'regular',
  size: 20,
  mirrored: false,
} as const

export function IconDefaults({ children }: { children: React.ReactNode }) {
  return (
    <IconContext.Provider value={ICON_DEFAULTS}>
      {children}
    </IconContext.Provider>
  )
}
