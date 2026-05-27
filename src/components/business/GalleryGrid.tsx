'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'

import type { Route } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import {
  ImageCard,
  IMAGE_CARD_PRESENTATIONS,
} from '@/components/business/ImageCard'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import type { GenerationRecord } from '@/types'

interface GalleryGridProps {
  generations: GenerationRecord[]
  emptyTitle: string
  emptyDescription: string
  emptyActionHref?: Route
  emptyActionLabel?: string
  feedLabel: string
  itemFallbackLabel: string
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
}

const INITIAL_VISIBLE_COUNT = 12
const RENDER_BATCH_SIZE = 12
const INITIAL_EAGER_IMAGE_INDEXES = new Set([0])
const EAGER_VIEWPORT_MARGIN_PX = 80
const SPATIAL_CROSS_AXIS_WEIGHT = 4

function areIndexSetsEqual(
  a: ReadonlySet<number>,
  b: ReadonlySet<number>,
): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function getRectCenter(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function getSpatialNavigationTarget(
  items: HTMLElement[],
  current: HTMLElement,
  key: string,
): HTMLElement | null {
  if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(key)) {
    return null
  }

  const currentRect = current.getBoundingClientRect()
  const currentCenter = getRectCenter(currentRect)
  let bestItem: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const item of items) {
    if (item === current) continue

    const rect = item.getBoundingClientRect()
    const center = getRectCenter(rect)
    let primaryDistance = 0
    let crossDistance = 0

    if (key === 'ArrowRight') {
      if (center.x <= currentCenter.x) continue
      primaryDistance = center.x - currentCenter.x
      crossDistance = Math.abs(center.y - currentCenter.y)
    } else if (key === 'ArrowLeft') {
      if (center.x >= currentCenter.x) continue
      primaryDistance = currentCenter.x - center.x
      crossDistance = Math.abs(center.y - currentCenter.y)
    } else if (key === 'ArrowDown') {
      if (center.y <= currentCenter.y) continue
      primaryDistance = center.y - currentCenter.y
      crossDistance = Math.abs(center.x - currentCenter.x)
    } else {
      if (center.y >= currentCenter.y) continue
      primaryDistance = currentCenter.y - center.y
      crossDistance = Math.abs(center.x - currentCenter.x)
    }

    const score = crossDistance * SPATIAL_CROSS_AXIS_WEIGHT + primaryDistance
    if (score < bestScore) {
      bestScore = score
      bestItem = item
    }
  }

  return bestItem
}

export function GalleryGrid({
  generations,
  emptyTitle,
  emptyDescription,
  emptyActionHref,
  emptyActionLabel,
  feedLabel,
  itemFallbackLabel,
  showVisibility = false,
  showDelete = false,
  onDelete,
}: GalleryGridProps) {
  // Progressive rendering: render in batches via IntersectionObserver
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)
  const [eagerIndexes, setEagerIndexes] = useState<ReadonlySet<number>>(
    () => INITIAL_EAGER_IMAGE_INDEXES,
  )
  const sentinelRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(prev + RENDER_BATCH_SIZE, generations.length),
          )
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [generations.length])

  const visibleGenerations = useMemo(
    () => generations.slice(0, visibleCount),
    [generations, visibleCount],
  )

  useEffect(() => {
    const measureEagerImages = () => {
      const feed = feedRef.current
      if (!feed) return

      const nextIndexes = new Set<number>()
      const items = feed.querySelectorAll<HTMLElement>('[data-gallery-index]')
      items.forEach((item) => {
        const index = Number(item.dataset.galleryIndex)
        if (!Number.isFinite(index)) return

        const rect = item.getBoundingClientRect()
        if (rect.top <= window.innerHeight + EAGER_VIEWPORT_MARGIN_PX) {
          nextIndexes.add(index)
        }
      })

      if (nextIndexes.size === 0) {
        INITIAL_EAGER_IMAGE_INDEXES.forEach((index) => nextIndexes.add(index))
      }

      setEagerIndexes((currentIndexes) =>
        areIndexSetsEqual(currentIndexes, nextIndexes)
          ? currentIndexes
          : nextIndexes,
      )
    }

    const frameId = window.requestAnimationFrame(measureEagerImages)
    window.addEventListener('resize', measureEagerImages)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', measureEagerImages)
    }
  }, [visibleGenerations.length])

  // Spatial keyboard navigation follows the visible masonry positions.
  const handleGalleryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const items = e.currentTarget.querySelectorAll<HTMLElement>(
        '[data-gallery-index]',
      )
      const current = document.activeElement as HTMLElement
      if (!current.matches('[data-gallery-index]')) return

      const nextItem = getSpatialNavigationTarget(
        Array.from(items),
        current,
        e.key,
      )

      if (nextItem) {
        e.preventDefault()
        nextItem.focus()
      }
    },
    [],
  )

  if (generations.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/3 px-6 py-16 text-center sm:px-10">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div className="space-y-2">
            <h3 className="font-display text-2xl font-medium tracking-tight text-foreground">
              {emptyTitle}
            </h3>
            <p className="font-serif text-sm leading-7 text-muted-foreground">
              {emptyDescription}
            </p>
          </div>
          {emptyActionHref && emptyActionLabel ? (
            <Button asChild className="rounded-full px-5">
              <Link href={emptyActionHref}>{emptyActionLabel}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <section
      ref={feedRef}
      role="feed"
      aria-label={feedLabel}
      className="columns-1 gap-6 sm:columns-2 xl:columns-3"
      onKeyDown={handleGalleryKeyDown}
    >
      {visibleGenerations.map((generation, index) => {
        return (
          <GalleryGridItem
            key={generation.id}
            generation={generation}
            index={index}
            total={generations.length}
            itemFallbackLabel={itemFallbackLabel}
            showVisibility={showVisibility}
            showDelete={showDelete}
            onDelete={onDelete}
            priority={eagerIndexes.has(index)}
            isLeadItem={index === 0}
          />
        )
      })}
      {/* Sentinel for progressive loading */}
      {visibleCount < generations.length && (
        <div ref={sentinelRef} className="h-px" />
      )}
    </section>
  )
}

interface GalleryGridItemProps {
  generation: GenerationRecord
  index: number
  total: number
  itemFallbackLabel: string
  showVisibility: boolean
  showDelete: boolean
  onDelete?: (id: string) => void
  priority: boolean
  isLeadItem: boolean
}

const GalleryGridItem = memo(function GalleryGridItem({
  generation,
  index,
  total,
  itemFallbackLabel,
  showVisibility,
  showDelete,
  onDelete,
  priority,
  isLeadItem,
}: GalleryGridItemProps) {
  return (
    <BlurFade
      delay={Math.min(index * 0.025, 0.2)}
      duration={0.22}
      offset={4}
      blur="0px"
      inView
      className={cn('mb-6 break-inside-avoid', isLeadItem && 'xl:mb-8')}
    >
      <div
        role="article"
        tabIndex={0}
        aria-posinset={index + 1}
        aria-setsize={total}
        aria-label={generation.prompt?.slice(0, 80) || itemFallbackLabel}
        data-gallery-index={index}
        className={cn(
          'rounded-xl transition-all duration-300 hover:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none',
          isLeadItem && 'bg-primary/6 p-1 ring-1 ring-primary/20',
        )}
      >
        <ImageCard
          generation={generation}
          showVisibility={showVisibility}
          showDelete={showDelete}
          onDelete={onDelete}
          priority={priority}
          presentation={IMAGE_CARD_PRESENTATIONS.GALLERY}
        />
      </div>
    </BlurFade>
  )
})
