'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'

import type { Route } from '@/constants/routes'
import { Link } from '@/i18n/navigation'

import { ImageCard } from '@/components/business/ImageCard'
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
const PRIORITY_IMAGE_COUNT = 1

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
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Progressive rendering: render in batches via IntersectionObserver
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)
  const sentinelRef = useRef<HTMLDivElement>(null)

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
  const handleMouseLeave = useCallback(() => setHoveredId(null), [])

  // Keyboard navigation: arrow keys move focus between gallery items
  const handleGalleryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const items =
        e.currentTarget.querySelectorAll<HTMLElement>('[role="article"]')
      const current = document.activeElement as HTMLElement
      const idx = Array.from(items).indexOf(current)
      if (idx === -1) return

      let next = -1
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        next = Math.min(idx + 1, items.length - 1)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        next = Math.max(idx - 1, 0)
      }
      if (next >= 0 && next !== idx) {
        e.preventDefault()
        items[next].focus()
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
      role="feed"
      aria-label={feedLabel}
      className="columns-1 gap-5 sm:columns-2 xl:columns-3"
      onMouseLeave={handleMouseLeave}
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
            isHovered={hoveredId === generation.id}
            isDimmed={hoveredId !== null && hoveredId !== generation.id}
            showVisibility={showVisibility}
            showDelete={showDelete}
            onDelete={onDelete}
            onHover={setHoveredId}
            priority={index < PRIORITY_IMAGE_COUNT}
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
  isHovered: boolean
  isDimmed: boolean
  showVisibility: boolean
  showDelete: boolean
  onDelete?: (id: string) => void
  onHover: (id: string) => void
  priority: boolean
}

const GalleryGridItem = memo(function GalleryGridItem({
  generation,
  index,
  total,
  itemFallbackLabel,
  isHovered,
  isDimmed,
  showVisibility,
  showDelete,
  onDelete,
  onHover,
  priority,
}: GalleryGridItemProps) {
  const handleHover = useCallback(() => {
    onHover(generation.id)
  }, [generation.id, onHover])

  return (
    <BlurFade
      delay={Math.min(index * 0.05, 0.5)}
      inView
      className="mb-5 break-inside-avoid"
    >
      <div
        role="article"
        tabIndex={0}
        aria-posinset={index + 1}
        aria-setsize={total}
        aria-label={generation.prompt?.slice(0, 80) || itemFallbackLabel}
        className="rounded-xl transition-all duration-300 hover:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
        style={{
          perspective: '1000px',
          transform: isHovered ? 'scale(1.02)' : 'scale(1)',
          opacity: isDimmed ? 0.5 : 1,
          filter: isDimmed ? 'blur(1px)' : 'none',
        }}
        onMouseEnter={handleHover}
        onFocus={handleHover}
      >
        <ImageCard
          generation={generation}
          showVisibility={showVisibility}
          showDelete={showDelete}
          onDelete={onDelete}
          priority={priority}
        />
      </div>
    </BlurFade>
  )
})
