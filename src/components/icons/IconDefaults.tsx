'use client'

import { IconContext } from '@phosphor-icons/react'

/**
 * Global Phosphor defaults.
 *
 * `weight: 'bold'` is the deliberate pick, not the library default. Measured on
 * the `Minus` glyph: Phosphor draws on a 256 box, lucide strokes 2px on a 24
 * box (= 21.3/256). Phosphor `regular` is a 16/256 bar — 25% thinner than what
 * the app has shipped so far — while `bold` is 24/256, within ~12% of it. Going
 * `regular` would have visibly lightened every icon in the product; `bold`
 * keeps the existing optical weight.
 *
 * Size is only a fallback: every call site sizes with a `size-*` class, which
 * wins over the context value.
 */
const ICON_DEFAULTS = {
  weight: 'bold',
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
