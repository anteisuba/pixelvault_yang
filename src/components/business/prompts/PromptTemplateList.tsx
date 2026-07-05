'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
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
import {
  PROMPT_TEMPLATE_OUTPUT_TYPES,
  PROMPT_OUTPUT_TYPE_LABEL_KEYS,
  type PromptTemplateOutputType,
} from '@/constants/prompt-library'
import { deleteRecipeAPI } from '@/lib/api-client/recipes'
import { cn } from '@/lib/utils'
import type { AppLocale } from '@/i18n/routing'
import type { OutputType } from '@/types'
import { OutputTypeChip, OUTPUT_TYPE_ICONS } from './OutputTypeChip'
import { PromptFilterChip } from './PromptFilterChip'
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

type TypeFilter = PromptTemplateOutputType | 'ALL'

export function PromptTemplateList({
  locale,
  recipes,
}: PromptTemplateListProps) {
  const t = useTranslations('PromptLibrary')
  const [items, setItems] = useState(recipes)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')

  useEffect(() => {
    setItems(recipes)
  }, [recipes])

  const handleDeleted = (id: string) => {
    setItems((prev) => prev.filter((recipe) => recipe.id !== id))
  }

  const visibleItems = useMemo(
    () =>
      typeFilter === 'ALL'
        ? items
        : items.filter((recipe) => recipe.outputType === typeFilter),
    [items, typeFilter],
  )

  return (
    <section className="space-y-4">
      <nav aria-label={t('typeFilterLabel')} className="flex flex-wrap gap-1.5">
        <PromptFilterChip
          label={t('typeFilterAll')}
          active={typeFilter === 'ALL'}
          onClick={() => setTypeFilter('ALL')}
        />
        {PROMPT_TEMPLATE_OUTPUT_TYPES.map((type) => (
          <PromptFilterChip
            key={type}
            label={t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[type])}
            active={typeFilter === type}
            onClick={() => setTypeFilter(type)}
          />
        ))}
      </nav>

      {visibleItems.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/50 px-5 py-10 text-center font-serif text-sm leading-6 text-muted-foreground">
          {t('typeFilterEmpty')}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((recipe) => (
            <PromptTemplateCard
              key={recipe.id}
              locale={locale}
              recipe={recipe}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/* Static per-modality classes for the no-cover fallback wash — Tailwind
   requires literal class names. */
const FALLBACK_WASH_CLASSES: Record<OutputType, string> = {
  IMAGE: 'bg-modality-image/10',
  VIDEO: 'bg-modality-video/10',
  AUDIO: 'bg-modality-audio/10',
  MODEL_3D: 'bg-muted/30',
}

const FALLBACK_ICON_CLASSES: Record<OutputType, string> = {
  IMAGE: 'text-modality-image/80',
  VIDEO: 'text-modality-video/80',
  AUDIO: 'text-modality-audio/80',
  MODEL_3D: 'text-muted-foreground/70',
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
  const FallbackIcon = OUTPUT_TYPE_ICONS[recipe.outputType]
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
      <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
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
            <div
              className={cn(
                'flex size-full flex-col justify-between p-5 pt-12',
                FALLBACK_WASH_CLASSES[recipe.outputType],
              )}
            >
              <FallbackIcon
                aria-hidden
                className={cn(
                  'size-6',
                  FALLBACK_ICON_CLASSES[recipe.outputType],
                )}
              />
              <p className="line-clamp-4 whitespace-pre-wrap font-serif text-sm leading-6 text-muted-foreground/85">
                {recipe.compiledPrompt}
              </p>
            </div>
          )}
          <OutputTypeChip
            outputType={recipe.outputType}
            label={recipe.outputTypeLabel}
            className="absolute left-2 top-2"
          />
        </button>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="line-clamp-2 font-display text-lg font-medium tracking-tight">
            {title}
          </h2>
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t('templateMeta', {
                model: recipe.modelId,
                version: recipe.version,
              })}
            </span>
            <span aria-hidden>·</span>
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
