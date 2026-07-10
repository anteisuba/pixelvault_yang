'use client'

import { useState, type ReactNode } from 'react'

import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'

export interface LoraCoverTileProps {
  /** Rendered cover URL, or null to show the fallback icon. */
  coverUrl: string | null
  /** Alt text for the cover image (empty string = decorative). */
  alt: string
  /** Centered icon shown when there is no cover. */
  fallbackIcon: ReactNode
  /** Top-left black-nacre pill label (family for public library, type for
   *  my-page). */
  badgeLabel: string
  /** Optional leading icon inside the badge (e.g. external-link for
   *  non-generatable families). */
  badgeIcon?: ReactNode
  /** Native title attribute for the badge (e.g. external hint). */
  badgeTitle?: string
  /** Top-right overlay slot — favourite heart (public) or actions menu
   *  (my-page). Sits above the cover so its own clicks don't fall through
   *  to the tile select button. */
  topRight?: ReactNode
  /** Extra absolutely-positioned overlays (recently-trained pill, hover
   *  action row, etc.). Rendered last so they layer on top. */
  overlay?: ReactNode
  /** When set, the whole cover becomes a button firing this (e.g. open the
   *  detail inspector). `interactiveLabel` is then required. */
  onClick?: () => void
  interactiveLabel?: string
  /** Primary selection ring (public library marks the open inspector's card). */
  selected?: boolean
  className?: string
}

/**
 * Shared cover-first tile for LoRA cards (B8 / P2-3): the 3:4 cover with
 * blur-up load, a top-left black-nacre badge, a top-right overlay slot, and
 * an optional selection ring. Both the public Civitai library card and the
 * my-page asset card compose their own chrome (name, buttons, menu) around
 * this identical base so the two grids read as one visual language.
 */
export function LoraCoverTile({
  coverUrl,
  alt,
  fallbackIcon,
  badgeLabel,
  badgeIcon,
  badgeTitle,
  topRight,
  overlay,
  onClick,
  interactiveLabel,
  selected,
  className,
}: LoraCoverTileProps) {
  // P1-1: some CDNs take seconds to deliver — pulse the placeholder while
  // loading, then fade the image in, instead of a dead black frame. On error
  // fall back to the icon: Civitai covers can 429/503 under burst load (see
  // proxyCivitaiImageUrl), and without onError a failed cover stays a black
  // pulsing hole forever instead of degrading to the same placeholder as a
  // cover-less card.
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  )

  // Route civitai covers through our edge-cache proxy so the browser never
  // hotlinks image.civitai.com directly (that burst is what trips the rate
  // limit). No-op for R2/own covers and when the proxy env is unset.
  const resolvedUrl = coverUrl ? proxyCivitaiImageUrl(coverUrl) : null
  const showImage = resolvedUrl !== null && status !== 'error'

  const cover = showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
      className={cn(
        'size-full object-cover transition-all duration-200 group-hover:scale-105',
        status === 'loaded' ? 'opacity-100' : 'opacity-0',
      )}
    />
  ) : (
    <div className="flex size-full items-center justify-center text-muted-foreground">
      {fallbackIcon}
    </div>
  )

  return (
    <div
      className={cn(
        'group relative aspect-[3/4] overflow-hidden rounded-xl bg-muted',
        resolvedUrl !== null && status === 'loading' && 'animate-pulse',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className,
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={interactiveLabel}
          className="absolute inset-0"
        >
          {cover}
        </button>
      ) : (
        cover
      )}
      {/* P2-1: family/type badge is always the same black nacre; external
          families only add a leading icon, never a solid warning colour. */}
      <span
        className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-2xs text-white"
        title={badgeTitle}
      >
        {badgeIcon}
        {badgeLabel}
      </span>
      {topRight ? (
        <div className="absolute right-1.5 top-1.5">{topRight}</div>
      ) : null}
      {overlay}
    </div>
  )
}
