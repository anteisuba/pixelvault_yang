'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { useGallery } from '@/hooks/use-gallery'
import { cn } from '@/lib/utils'
import type { GenerationRecord, OutputTypeFilter } from '@/types'

interface AssetBrowserProps {
  /**
   * Project sentinel passed straight to useGallery filters:
   *   '' / undefined → all projects
   *   'none'         → unassigned generations only
   *   <uuid>         → that specific project
   */
  projectId?: string
  /** Restrict the grid to a single media type (defaults to "all"). */
  mediaType?: OutputTypeFilter
  /** Click handler — receives the full GenerationRecord so callers can pull
   *  url, prompt, or any other field they need. */
  onSelect: (generation: GenerationRecord) => void
  /** Optional empty-state copy override (defaults to LibraryPage.assetBrowserEmpty). */
  emptyLabel?: string
  className?: string
}

/**
 * AssetBrowser — reusable thumbnail grid over the user's own generations.
 * Used by Profile (Phase 5+) and the Studio reference-image chip popover
 * (Phase 5.5). Lives outside any context provider, so it's safe to mount
 * in any tree as long as the user is signed in (useGallery hits the
 * authenticated /api/images endpoint).
 *
 * Visual: search input on top, 4-col square thumbnail grid below, infinite
 * scroll via the existing useGallery sentinel. Compact by design — no
 * visibility / like / download chrome on each card; tap a thumbnail to
 * select and close.
 */
export function AssetBrowser({
  projectId = '',
  mediaType = 'all',
  onSelect,
  emptyLabel,
  className,
}: AssetBrowserProps) {
  const t = useTranslations('LibraryPage')
  const [searchInput, setSearchInput] = useState('')

  const { generations, isLoading, hasMore, sentinelRef, filters, setFilters } =
    useGallery({
      initialFilters: {
        search: '',
        model: '',
        sort: 'newest',
        type: mediaType,
        timeRange: 'all',
        liked: false,
        projectId,
      },
      mine: true,
    })

  // useGallery doesn't auto-fetch on mount (it expects SSR-supplied
  // initialGenerations). AssetBrowser mounts inside popovers / dialogs with
  // no SSR data, so re-apply the filters once to trigger the first fetch.
  const didInitialFetchRef = useRef(false)
  useEffect(() => {
    if (didInitialFetchRef.current) return
    didInitialFetchRef.current = true
    setFilters(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFilters({ ...filters, search: searchInput.trim() })
  }

  const isEmpty = !isLoading && generations.length === 0

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <form onSubmit={handleSearchSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('assetBrowserSearch')}
          className="h-8 pl-8 text-xs"
        />
      </form>

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
          {emptyLabel ?? t('assetBrowserEmpty')}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {generations.map((gen) => (
            <button
              key={gen.id}
              type="button"
              onClick={() => onSelect(gen)}
              className={cn(
                'group relative overflow-hidden rounded-md border border-border/60 bg-muted/40 transition-all duration-200',
                'hover:border-primary/40 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
              )}
              aria-label={gen.prompt || gen.id}
              title={gen.prompt || undefined}
            >
              {gen.outputType === 'VIDEO' ? (
                <video
                  src={`${gen.url}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={gen.url}
                  alt={gen.prompt || ''}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              )}
            </button>
          ))}
          {hasMore && <div ref={sentinelRef} className="col-span-4 h-2" />}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{t('assetBrowserLoading')}</span>
        </div>
      )}
    </div>
  )
}
