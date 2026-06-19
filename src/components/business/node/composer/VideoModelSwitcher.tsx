'use client'

import { type KeyboardEvent } from 'react'

import { type VideoVariantId } from '@/constants/video-brands'
import { cn } from '@/lib/utils'

interface VideoModelSwitcherProps {
  brands: string[]
  currentBrand: string | null
  brandLabel(brand: string): string
  variants: readonly VideoVariantId[]
  currentVariant: VideoVariantId | null
  variantLabel(variant: VideoVariantId): string
  variantAriaLabel: string
  onSelectBrand(brand: string): void
  onSelectVariant(variant: VideoVariantId): void
}

// Stop on the LEAF (not a wrapper) so the control still receives the key but it
// never bubbles to ReactFlow (Space=pan, Backspace/Delete=delete node). Mirrors
// the proven `stopCanvasKeyboardEvent` pattern in ComposerInspector.
function stopCanvasKey(event: KeyboardEvent<HTMLElement>) {
  event.stopPropagation()
}

const KEY_GUARD = {
  onKeyDownCapture: stopCanvasKey,
  onKeyUpCapture: stopCanvasKey,
} as const

/**
 * Two-tier model switcher (§5.1): brand segment + variant dropdown.
 * Presentational — the parent (`VideoComposer` via `useVideoComposer`) resolves
 * the concrete model. Provider (fal/VolcEngine) is a separate control
 * (`VideoProviderPicker`).
 */
export function VideoModelSwitcher({
  brands,
  currentBrand,
  brandLabel,
  variants,
  currentVariant,
  variantLabel,
  variantAriaLabel,
  onSelectBrand,
  onSelectVariant,
}: VideoModelSwitcherProps) {
  return (
    <div className="nodrag space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {brands.map((brand) => {
          const isActive = brand === currentBrand
          return (
            <button
              key={brand}
              type="button"
              {...KEY_GUARD}
              onClick={() => onSelectBrand(brand)}
              aria-pressed={isActive}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-2xs font-semibold transition-colors',
                isActive
                  ? 'border-node-edge bg-node-panel-inner text-node-foreground'
                  : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-edge hover:text-node-foreground',
              )}
            >
              {brandLabel(brand)}
            </button>
          )
        })}
      </div>
      {variants.length > 0 ? (
        <select
          value={currentVariant ?? variants[0]}
          aria-label={variantAriaLabel}
          {...KEY_GUARD}
          onChange={(event) =>
            onSelectVariant(event.target.value as VideoVariantId)
          }
          className="h-8 w-full rounded-lg border border-node-panel-inner bg-node-panel-soft px-2 text-2xs font-medium text-node-foreground outline-none focus-visible:border-node-edge"
        >
          {variants.map((variant) => (
            <option key={variant} value={variant}>
              {variantLabel(variant)}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
