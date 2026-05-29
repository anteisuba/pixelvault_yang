'use client'
/* eslint-disable @next/next/no-img-element -- inspiration images are external */

import { Copy, ExternalLink, Heart, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  MediaDetailViewer,
  toMediaTransitionOrigin,
  type MediaTransitionOrigin,
} from '@/components/business/MediaDetailViewer'
import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import type { CloneInspirationRequest, InspirationRecord } from '@/types'

interface InspirationCardProps {
  inspiration: InspirationRecord
  onClone: (
    id: string,
    overrides?: CloneInspirationRequest,
  ) => Promise<{ success: boolean; recipe?: { id: string }; error?: string }>
}

const PROMPT_PREVIEW_MAX_CHARS = 320

export function InspirationCard({
  inspiration,
  onClone,
}: InspirationCardProps) {
  const t = useTranslations('PromptLibrary')
  const router = useRouter()
  const [isCloning, setIsCloning] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [transitionOrigin, setTransitionOrigin] =
    useState<MediaTransitionOrigin | null>(null)
  const tCommon = useTranslations('Common')

  const previewPrompt =
    inspiration.prompt.length > PROMPT_PREVIEW_MAX_CHARS
      ? `${inspiration.prompt.slice(0, PROMPT_PREVIEW_MAX_CHARS).trimEnd()}...`
      : inspiration.prompt

  async function handleClone() {
    setIsCloning(true)
    try {
      const result = await onClone(inspiration.id)
      if (result.success && result.recipe) {
        toast.success(t('inspirationCloneSuccess'))
        router.push(`${ROUTES.PROMPTS}/${result.recipe.id}`)
        router.refresh()
      } else {
        toast.error(result.error ?? t('inspirationCloneFailed'))
      }
    } finally {
      setIsCloning(false)
    }
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(inspiration.prompt)
      toast.success(t('promptCopied'))
    } catch {
      toast.error(t('inspirationCloneFailed'))
    }
  }

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 transition-colors hover:border-primary/30">
        <button
          type="button"
          aria-label={t('viewDetail')}
          onClick={(event) => {
            setTransitionOrigin(
              toMediaTransitionOrigin(
                event.currentTarget.getBoundingClientRect(),
              ),
            )
            setDetailOpen(true)
          }}
          className="relative aspect-square overflow-hidden bg-muted/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {!imageFailed ? (
            <img
              src={inspiration.imageUrl}
              alt={inspiration.authorName}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {t('inspirationImageUnavailable')}
            </div>
          )}
          {inspiration.likes > 0 && (
            <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[11px] font-medium text-foreground backdrop-blur-sm">
              <Heart className="size-3" />
              {formatCount(inspiration.likes)}
            </div>
          )}
        </button>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <p className="whitespace-pre-wrap font-serif text-sm leading-6 text-foreground/85">
            {previewPrompt}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {inspiration.categories.map((cat) => (
              <Badge
                key={cat}
                variant="outline"
                className="rounded-full text-[10px]"
              >
                {cat}
              </Badge>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <a
              href={inspiration.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <span>@{inspiration.authorName}</span>
              <ExternalLink className="size-3" />
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isCloning}
              onClick={() => void handleClone()}
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
            >
              {isCloning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {isCloning ? t('inspirationCloning') : t('inspirationClone')}
            </Button>
          </div>
        </div>
      </article>

      <MediaDetailViewer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={t('inspirationTitle')}
        description={inspiration.prompt}
        closeLabel={tCommon('close')}
        media={
          <img
            src={inspiration.imageUrl}
            alt={inspiration.authorName}
            className="relative z-10 h-auto max-h-[calc(48dvh-4rem)] max-w-full rounded-2xl object-contain shadow-sm lg:max-h-[calc(100dvh-8rem)]"
          />
        }
        sideHeader={
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  @{inspiration.authorName}
                </p>
                <a
                  href={inspiration.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {inspiration.author}
                  <ExternalLink className="size-3" />
                </a>
              </div>
              {inspiration.modelHint ? (
                <Badge variant="outline" className="shrink-0 rounded-full">
                  {inspiration.modelHint}
                </Badge>
              ) : null}
            </div>
            {inspiration.likes > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
                <Heart className="size-3" />
                {formatCount(inspiration.likes)}
              </span>
            ) : null}
          </div>
        }
        sideContent={
          <div className="space-y-4">
            <p className="whitespace-pre-wrap font-serif text-sm leading-7 text-foreground">
              {inspiration.prompt}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {inspiration.categories.map((cat) => (
                <Badge
                  key={cat}
                  variant="outline"
                  className="rounded-full text-[10px]"
                >
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        }
        footerActions={
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              disabled={isCloning}
              onClick={() => void handleClone()}
              className="h-10 rounded-full"
            >
              {isCloning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isCloning ? t('inspirationCloning') : t('inspirationClone')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleCopyPrompt()}
              className="h-10 rounded-full"
            >
              <Copy className="size-4" />
              {t('copyPrompt')}
            </Button>
          </div>
        }
        transitionOrigin={transitionOrigin}
        transitionImageSrc={inspiration.imageUrl}
        transitionImageAlt={inspiration.authorName}
      />
    </>
  )
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}
