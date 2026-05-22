'use client'

import { Info } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface CardTileBaseProps {
  /** Image src; renders {@link placeholder} when null. */
  sourceImageUrl: string | null
  /** Alt text for the underlying image (also used as the visible name in callers' overlays). */
  alt: string
  isSelected: boolean
  /**
   * Tailwind class controlling tile aspect — kept as a free-form string rather
   * than an enum so callers can pass whatever ratio their domain needs
   * (`aspect-video`, `aspect-square`, `aspect-[3/4]`, …) without us having to
   * keep an exhaustive list in sync.
   */
  aspectClass: string
  /** Forwarded to next/image. Each caller sizes its grid differently. */
  sizes: string
  onToggleSelect: () => void
  selectAriaLabel: string
  deselectAriaLabel: string
  /**
   * Info button shown top-right on hover. Omit to suppress the button entirely
   * (e.g. tiles that have nowhere to drill down into).
   */
  onOpenDetail?: () => void
  /** Required when {@link onOpenDetail} is provided; ignored otherwise. */
  viewDetailsLabel?: string
  /** Rendered behind the bottom overlay when sourceImageUrl is null. */
  placeholder?: ReactNode
  /** Optional slot for status chips / variant labels overlaid top-left. */
  topLeftBadge?: ReactNode
  /**
   * Bottom gradient overlay content (typically name + meta). The gradient
   * background is provided by the base; callers only render their text/badges.
   */
  bottomOverlay: ReactNode
}

/**
 * Shared chrome for selectable card thumbnails — the group wrapper, the
 * selection button with its hover/selected/focus states, the next/image fill,
 * the bottom gradient slot, and the top-right info affordance.
 *
 * Domain-specific cards (`MediaCardTile`, `CharacterCardTile`, future ones)
 * compose this and pass their own `bottomOverlay` + `topLeftBadge` + aspect.
 * Keep this file purely presentational — no i18n, no domain types, no fetches.
 */
export function CardTileBase({
  sourceImageUrl,
  alt,
  isSelected,
  aspectClass,
  sizes,
  onToggleSelect,
  selectAriaLabel,
  deselectAriaLabel,
  onOpenDetail,
  viewDetailsLabel,
  placeholder,
  topLeftBadge,
  bottomOverlay,
}: CardTileBaseProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={isSelected}
        aria-label={isSelected ? deselectAriaLabel : selectAriaLabel}
        className={cn(
          'relative block w-full overflow-hidden rounded-lg border bg-card transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          aspectClass,
          isSelected
            ? 'scale-[0.96] border-primary ring-2 ring-primary'
            : 'border-white/10 hover:scale-[1.02] hover:border-white/30',
        )}
      >
        {sourceImageUrl ? (
          <Image
            src={sourceImageUrl}
            alt={alt}
            fill
            sizes={sizes}
            className="object-cover"
            loading="lazy"
          />
        ) : (
          (placeholder ?? (
            <div className="absolute inset-0 bg-muted/30" aria-hidden />
          ))
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-8">
          {bottomOverlay}
        </div>

        {topLeftBadge}
      </button>

      {onOpenDetail && (
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={viewDetailsLabel}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Info className="size-3.5" />
        </button>
      )}
    </div>
  )
}
