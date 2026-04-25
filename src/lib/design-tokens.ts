/**
 * Design tokens — single source of truth for brand colors.
 *
 * Use CSS variables (`var(--primary)`, `var(--background)`, etc.) in components
 * wherever possible. These hex constants exist solely for contexts that cannot
 * consume CSS variables (e.g. Satori/OG image rendering, canvas drawing).
 *
 * @see globals.css — OKLch CSS variable definitions
 * @see docs/reference/design-system.md — full spec
 */

// ─── Brand Colors (hex fallbacks) ───────────────────────────────

/** Warm off-white background — NEVER use pure #fff */
export const BRAND_BG = '#faf9f5' as const

/** Near-black foreground for body text */
export const BRAND_FG = '#141413' as const

/** Warm accent — buttons, active states, highlights */
export const BRAND_ACCENT = '#d97757' as const

/** Darker accent — gradient endpoints */
export const BRAND_ACCENT_DARK = '#b85c3a' as const

/** Light border / separator */
export const BRAND_BORDER = '#e8e6dc' as const

/** Muted text (secondary) */
export const BRAND_MUTED = '#b0aea5' as const

/** Soft background surface (cards, modals) */
export const BRAND_SURFACE = '#f0efe8' as const

// ─── CSS Variable Names ─────────────────────────────────────────
// Map to :root definitions in globals.css. Use with `var(...)`.

export const CSS_VAR = {
  bg: '--background',
  fg: '--foreground',
  primary: '--primary',
  border: '--border',
  muted: '--muted',
  mutedFg: '--muted-foreground',
  accent: '--accent',
  surface: '--card',
} as const
