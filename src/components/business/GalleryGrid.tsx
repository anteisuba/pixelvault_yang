'use client'

import { Sparkles } from 'lucide-react'

import type { Route } from '@/constants/routes'
import { Link } from '@/i18n/navigation'

import { ImageCard } from '@/components/business/ImageCard'
import { Button } from '@/components/ui/button'
import type { GenerationRecord } from '@/types'

interface GalleryGridProps {
  generations: GenerationRecord[]
  emptyTitle: string
  emptyDescription: string
  emptyActionHref?: Route
  emptyActionLabel?: string
  showVisibility?: boolean
}

export function GalleryGrid({
  generations,
  emptyTitle,
  emptyDescription,
  emptyActionHref,
  emptyActionLabel,
  showVisibility = false,
}: GalleryGridProps) {
  if (generations.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border/75 bg-secondary/14 px-6 py-12 text-center sm:px-10">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-full border border-border/80 bg-background/90 text-primary">
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
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      {generations.map((generation) => (
        <div key={generation.id} className="mb-4 break-inside-avoid">
          <ImageCard generation={generation} showVisibility={showVisibility} />
        </div>
      ))}
    </div>
  )
}
