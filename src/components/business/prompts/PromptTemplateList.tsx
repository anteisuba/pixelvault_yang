'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { deleteRecipeAPI } from '@/lib/api-client/recipes'
import type { AppLocale } from '@/i18n/routing'
import type { OutputType } from '@/types'
import { PromptTemplateDetailDialog } from '@/components/business/prompts/PromptTemplateDetailDialog'

export interface PromptTemplateListItem {
  id: string
  outputType: OutputType
  outputTypeLabel: string
  name: string
  compiledPrompt: string
  modelId: string
  version: number
  createdAt: string
  /** First image generated with this template (cover). Null → text fallback. */
  coverThumbnailUrl?: string | null
}

interface PromptTemplateListProps {
  locale: AppLocale
  recipes: PromptTemplateListItem[]
}

export function PromptTemplateList({
  locale,
  recipes,
}: PromptTemplateListProps) {
  const [items, setItems] = useState(recipes)

  useEffect(() => {
    setItems(recipes)
  }, [recipes])

  const handleDeleted = (id: string) => {
    setItems((prev) => prev.filter((recipe) => recipe.id !== id))
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((recipe) => (
        <PromptTemplateCard
          key={recipe.id}
          locale={locale}
          recipe={recipe}
          onDeleted={handleDeleted}
        />
      ))}
    </section>
  )
}

interface PromptTemplateCardProps {
  locale: AppLocale
  recipe: PromptTemplateListItem
  onDeleted: (id: string) => void
}

function PromptTemplateCard({
  locale,
  recipe,
  onDeleted,
}: PromptTemplateCardProps) {
  const t = useTranslations('PromptLibrary')
  const [detailOpen, setDetailOpen] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const title = recipe.name || recipe.modelId
  const formattedDate = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(recipe.createdAt))

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteRecipeAPI(recipe.id)
      if (result.success) {
        toast.success(t('deleteSuccess'))
        onDeleted(recipe.id)
        return
      }
      toast.error(result.error ?? t('deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 transition-colors hover:border-primary/25">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              aria-label={t('deleteAction')}
              className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 backdrop-blur-sm transition hover:bg-background hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteConfirmDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                {t('deleteCancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
              >
                {t('deleteConfirmAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <button
          type="button"
          aria-label={`${t('viewDetail')}: ${title}`}
          onClick={() => setDetailOpen(true)}
          className="relative aspect-square overflow-hidden bg-muted/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {recipe.coverThumbnailUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives
            <img
              src={recipe.coverThumbnailUrl}
              alt={title}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
            />
          ) : (
            <div className="flex size-full flex-col justify-between p-5">
              <Sparkles className="size-5 text-primary/55" />
              <p className="line-clamp-4 whitespace-pre-wrap font-serif text-sm leading-6 text-muted-foreground/85">
                {recipe.compiledPrompt}
              </p>
            </div>
          )}
        </button>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="line-clamp-2 font-display text-lg font-medium tracking-tight">
            {title}
          </h2>
          <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
        </div>
      </article>

      <PromptTemplateDetailDialog
        recipe={recipe}
        locale={locale}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDeleted={onDeleted}
      />
    </>
  )
}
