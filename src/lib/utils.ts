import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The nine shadows of the interface spec (ui-spec.md §5). Without this list
 * tailwind-merge reads `shadow-pop` as a shadow *colour*, so
 * `cn('shadow-sm', 'shadow-pop')` keeps both.
 */
const SPEC_SHADOWS = [
  'ring',
  'soft',
  'seg',
  'card',
  'lift',
  'pop',
  'bar',
  'media-action',
  'focus',
  'float',
]

/** The radius steps the T-shirt scale lacks (`rounded-12` …, ui-spec.md §5). */
const SPEC_RADII = ['12', '16', '20', '24']

/**
 * tailwind-merge only knows numeric durations (`duration-150`), T-shirt
 * shadows and T-shirt radii. The named steps globals.css registers under
 * `--transition-duration-*`, `--shadow-*` and `--radius-*` must be listed here
 * too, or `cn('duration-150', 'duration-fast')` keeps both and the named one
 * always wins on CSS order. Keep in sync with globals.css (guarded by
 * utils.test.ts).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      duration: [
        {
          duration: [
            'fast',
            'base',
            'slow',
            'reveal',
            'spring-expand',
            'spring-slot',
            'spring-press',
          ],
        },
      ],
      shadow: [{ shadow: SPEC_SHADOWS }],
      rounded: [{ rounded: SPEC_RADII }],
      'rounded-t': [{ 'rounded-t': SPEC_RADII }],
      'rounded-b': [{ 'rounded-b': SPEC_RADII }],
      'rounded-l': [{ 'rounded-l': SPEC_RADII }],
      'rounded-r': [{ 'rounded-r': SPEC_RADII }],
    },
  },
})

/**
 * Merge Tailwind CSS class names with conflict resolution.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the label class name for metadata display, adjusting for CJK locales.
 * Shared by ImageCard and ImageDetailModal.
 */
/**
 * Convert UI referenceStrength (higher = more similar to original)
 * to API denoising strength (higher = more change from original).
 * Clamps the result to [0.01, 0.99] to avoid degenerate values.
 */
export function invertReferenceStrength(referenceStrength: number): number {
  return Math.max(0.01, Math.min(0.99, 1 - referenceStrength))
}

export function getLabelClassName(isDenseLocale: boolean) {
  return cn(
    'text-2xs font-semibold text-muted-foreground',
    isDenseLocale
      ? 'tracking-normal normal-case'
      : 'uppercase tracking-nav-dense',
  )
}
