'use client'
/* eslint-disable @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives */

import { Images, Sparkles } from '@/components/icons'
import { useTranslations } from 'next-intl'

import type { Route } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import { screenItemProps } from '@/lib/assistant-screen-scan'
import { getTranslatedModelLabel } from '@/lib/model-options'

import { CopyButton } from '@/components/ui/copy-button'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { GenerationRecord } from '@/types'

interface GalleryPromptListProps {
  generations: GenerationRecord[]
  emptyTitle: string
  emptyDescription: string
  emptyActionHref: Route
  emptyActionLabel: string
  feedLabel: string
  /** 点卡打开就地查看器；不给（平板）就只能读和复制。 */
  onOpen?: (generation: GenerationRecord) => void
}

/**
 * 画廊「提示词」看法（domains/gallery.md）：同一批公开作品，提示词做主角、图缩成一角。
 * 服务端只给提示词公开的作品，所以这里每张卡都有字；一段提示词只出一张卡，卡面是它
 * 最新的一件，缩略图角上是这段提示词一共几件（owner 2026-10-23）。
 */
export function GalleryPromptList({
  generations,
  emptyTitle,
  emptyDescription,
  emptyActionHref,
  emptyActionLabel,
  feedLabel,
  onOpen,
}: GalleryPromptListProps) {
  if (generations.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles aria-hidden />}
        title={emptyTitle}
        description={emptyDescription}
        action={
          <Button asChild className="rounded-full px-5">
            <Link href={emptyActionHref}>{emptyActionLabel}</Link>
          </Button>
        }
      />
    )
  }

  return (
    <section
      role="feed"
      aria-label={feedLabel}
      className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 desk:grid-cols-3 3xl:grid-cols-4"
    >
      {generations.map((generation) => (
        <GalleryPromptCard
          key={generation.id}
          generation={generation}
          onOpen={onOpen}
        />
      ))}
    </section>
  )
}

function GalleryPromptCard({
  generation,
  onOpen,
}: {
  generation: GenerationRecord
  onOpen?: (generation: GenerationRecord) => void
}) {
  const t = useTranslations('GalleryPage')
  const tModels = useTranslations('Models')
  // 视频没有封面图时，`url` 是 mp4，不能塞进 <img>：退回视频首帧。
  const stillUrl =
    generation.outputType === 'IMAGE'
      ? (generation.thumbnailUrl ?? getGenerationPreviewUrl(generation))
      : (generation.thumbnailUrl ?? generation.previewUrl ?? null)
  const thumbClass = 'size-20 shrink-0 rounded-xl bg-muted object-cover'
  const author =
    generation.creator?.displayName || generation.creator?.username || null
  const workCount = generation.promptWorkCount ?? 1

  return (
    <article
      {...screenItemProps('gallery', generation.id, stillUrl)}
      className="relative flex gap-3 rounded-2xl border border-border/70 bg-background p-3 shadow-sm transition-shadow duration-fast ease-linear hover:shadow-md"
    >
      <span className="relative shrink-0">
        {stillUrl ? (
          <img src={stillUrl} alt="" loading="lazy" className={thumbClass} />
        ) : generation.outputType === 'VIDEO' ? (
          <video
            src={generation.url}
            muted
            playsInline
            preload="metadata"
            aria-hidden
            className={thumbClass}
          />
        ) : (
          <span aria-hidden className={thumbClass} />
        )}
        {workCount > 1 ? (
          <span
            aria-label={t('promptWorkCount', { count: workCount })}
            className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-2xs tabular-nums text-white backdrop-blur-md"
          >
            <Images className="size-3" aria-hidden />
            {workCount}
          </span>
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(generation)}
            aria-label={t('openPromptWork')}
            className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            <PromptText prompt={generation.prompt} />
          </button>
        ) : (
          <PromptText prompt={generation.prompt} />
        )}
        <div className="mt-auto flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {[author, getTranslatedModelLabel(tModels, generation.model)]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <CopyButton
            text={generation.prompt}
            className="relative z-10 ml-auto shrink-0"
          />
        </div>
      </div>
    </article>
  )
}

function PromptText({ prompt }: { prompt: string }) {
  return (
    <p className="line-clamp-6 whitespace-pre-line break-words text-2sm leading-5 text-foreground">
      {prompt}
    </p>
  )
}
