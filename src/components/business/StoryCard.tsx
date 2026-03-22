'use client'

import { BookOpen, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

import type { StoryListItem } from '@/types'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/button'

interface StoryCardProps {
  story: StoryListItem
  onDelete: (id: string) => void
}

export function StoryCard({ story, onDelete }: StoryCardProps) {
  const t = useTranslations('StoryBoard')

  return (
    <div className="group overflow-hidden rounded-2xl border border-border/75 transition-all hover:border-border hover:shadow-sm">
      {/* Cover image */}
      <Link href={`${ROUTES.STORYBOARD}/${story.id}`}>
        <div className="aspect-video overflow-hidden bg-muted/30">
          {story.coverImageUrl ? (
            <img
              src={story.coverImageUrl}
              alt={story.title}
              className="size-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <BookOpen className="size-8 text-muted-foreground/30" />
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <Link href={`${ROUTES.STORYBOARD}/${story.id}`}>
          <h3 className="truncate text-sm font-semibold text-foreground">
            {story.title}
          </h3>
        </Link>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t('panelCount', { count: story.panelCount })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(story.id)}
            className="size-7 rounded-full p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
