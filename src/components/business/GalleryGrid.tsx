'use client'

import { useEffect, useRef, useState } from 'react'
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
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
}

export function GalleryGrid({
  generations,
  emptyTitle,
  emptyDescription,
  emptyActionHref,
  emptyActionLabel,
  showVisibility = false,
  showDelete = false,
  onDelete,
}: GalleryGridProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Progressive rendering: render in batches via IntersectionObserver
  const BATCH_SIZE = 20
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(prev + BATCH_SIZE, generations.length),
          )
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [generations.length])

  const visibleGenerations = generations.slice(0, visibleCount)

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
      aria-label="Gallery"
      className="columns-1 gap-5 sm:columns-2 xl:columns-3"
      onMouseLeave={() => setHoveredId(null)}
    >
      {visibleGenerations.map((generation, index) => {
        const isHovered = hoveredId === generation.id
        const isSomethingHovered = hoveredId !== null
        return (
          <BlurFade
            key={generation.id}
            delay={Math.min(index * 0.05, 0.5)}
            inView
            className="mb-5 break-inside-avoid"
          >
            <div
              role="article"
              aria-posinset={index + 1}
              aria-setsize={generations.length}
              className="transition-all duration-300 hover:z-10"
              style={{
                perspective: '1000px',
                transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                opacity: isSomethingHovered && !isHovered ? 0.5 : 1,
                filter: isSomethingHovered && !isHovered ? 'blur(1px)' : 'none',
              }}
              onMouseEnter={() => setHoveredId(generation.id)}
            >
              <ImageCard
                generation={generation}
                showVisibility={showVisibility}
                showDelete={showDelete}
                onDelete={onDelete}
              />
            </div>
          </BlurFade>
        )
      })}
      {/* Sentinel for progressive loading */}
      {visibleCount < generations.length && (
        <div ref={sentinelRef} className="h-px" />
      )}
    </section>
  )
}
