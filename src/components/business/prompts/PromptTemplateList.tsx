'use client'

import { useState } from 'react'
import { Copy, FileText, Pencil, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  MediaDetailViewer,
  toMediaTransitionOrigin,
  type MediaTransitionOrigin,
} from '@/components/business/MediaDetailViewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import { Link, useRouter } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import type { OutputType } from '@/types'

export interface PromptTemplateListItem {
  id: string
  outputType: OutputType
  outputTypeLabel: string
  name: string
  compiledPrompt: string
  modelId: string
  version: number
  createdAt: string
}

interface PromptTemplateListProps {
  locale: AppLocale
  recipes: PromptTemplateListItem[]
}

function getStudioRoute(outputType: OutputType) {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

export function PromptTemplateList({
  locale,
  recipes,
}: PromptTemplateListProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {recipes.map((recipe) => (
        <PromptTemplateCard key={recipe.id} locale={locale} recipe={recipe} />
      ))}
    </section>
  )
}

interface PromptTemplateCardProps {
  locale: AppLocale
  recipe: PromptTemplateListItem
}

function PromptTemplateCard({ locale, recipe }: PromptTemplateCardProps) {
  const t = useTranslations('PromptLibrary')
  const tCommon = useTranslations('Common')
  const router = useRouter()
  const [detailOpen, setDetailOpen] = useState(false)
  const [transitionOrigin, setTransitionOrigin] =
    useState<MediaTransitionOrigin | null>(null)
  const title = recipe.name || recipe.modelId
  const createdAt = new Date(recipe.createdAt)
  const formattedDate = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(createdAt)
  const detailHref = `${ROUTES.PROMPTS}/${recipe.id}`

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(recipe.compiledPrompt)
      toast.success(t('promptCopied'))
    } catch {
      toast.error(t('inspirationCloneFailed'))
    }
  }

  const useInStudio = () => {
    const prompt = recipe.compiledPrompt.trim()
    if (!prompt) {
      toast.error(t('createPromptRequired'))
      return
    }
    window.sessionStorage.setItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY, prompt)
    router.push(getStudioRoute(recipe.outputType))
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${t('viewDetail')}: ${title}`}
        onClick={(event) => {
          setTransitionOrigin(
            toMediaTransitionOrigin(
              event.currentTarget.getBoundingClientRect(),
            ),
          )
          setDetailOpen(true)
        }}
        className="group rounded-2xl border border-border/60 bg-card/80 p-5 text-left transition-colors hover:border-primary/25 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h2 className="line-clamp-2 font-display text-xl font-medium tracking-tight">
              {title}
            </h2>
            <p className="line-clamp-3 whitespace-pre-wrap font-serif text-sm leading-7 text-muted-foreground">
              {recipe.compiledPrompt}
            </p>
          </div>
          <Sparkles className="size-5 shrink-0 text-primary/70 transition-transform group-hover:scale-105" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="rounded-full">
            {recipe.outputTypeLabel}
          </Badge>
          <span>
            {t('templateMeta', {
              model: recipe.modelId,
              version: recipe.version,
            })}
          </span>
          <span>{formattedDate}</span>
        </div>
      </button>

      <MediaDetailViewer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={title}
        description={recipe.compiledPrompt}
        closeLabel={tCommon('close')}
        media={
          <div className="relative z-10 flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/85 p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Badge variant="secondary" className="rounded-full">
                {recipe.outputTypeLabel}
              </Badge>
              <FileText className="size-5 text-primary/70" />
            </div>
            <h2 className="font-display text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-3xl">
              {title}
            </h2>
            <p className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
              {recipe.compiledPrompt}
            </p>
          </div>
        }
        sideHeader={
          <div className="space-y-3">
            <div className="min-w-0">
              <p className="break-words text-base font-medium text-foreground">
                {title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('templateMeta', {
                  model: recipe.modelId,
                  version: recipe.version,
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {recipe.outputTypeLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formattedDate}
              </span>
            </div>
          </div>
        }
        sideContent={
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
              <p className="whitespace-pre-wrap font-serif text-sm leading-7 text-foreground">
                {recipe.compiledPrompt}
              </p>
            </div>
          </div>
        }
        footerActions={
          <div className="grid gap-2">
            <Button
              type="button"
              size="sm"
              onClick={useInStudio}
              className="h-10 rounded-full"
            >
              <Sparkles className="size-4" />
              {t('useInStudio')}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyPrompt()}
                className="h-10 rounded-full"
              >
                <Copy className="size-4" />
                {t('copyPrompt')}
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-10 rounded-full"
              >
                <Link href={detailHref}>
                  <Pencil className="size-4" />
                  {t('editAction')}
                </Link>
              </Button>
            </div>
          </div>
        }
        transitionOrigin={transitionOrigin}
      />
    </>
  )
}
