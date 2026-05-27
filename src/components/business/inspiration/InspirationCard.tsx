'use client'

import { ExternalLink, Heart, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 transition-colors hover:border-primary/30">
      <div className="relative aspect-square overflow-hidden bg-muted/30">
        {!imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- external host, unoptimized
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
      </div>

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
  )
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}
