'use client'

import { useEffect, useMemo, useState } from 'react'
import { Globe, Pencil, Search, Trash2 } from 'lucide-react'
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
  RECIPE_VISIBILITY,
  type PromptTemplateOutputType,
} from '@/constants/prompt-library'
import { deleteRecipeAPI } from '@/lib/api-client/recipes'
import type { AppLocale } from '@/i18n/routing'
import type { OutputType } from '@/types'
import { OutputTypeChip } from './OutputTypeChip'
import { PromptFilterChip } from './PromptFilterChip'
import { PromptTemplateDetailDialog } from '@/components/business/prompts/PromptTemplateDetailDialog'
import { CopyPromptButton } from './CopyPromptButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface PromptTemplateListItem {
  id: string
  outputType: OutputType
  outputTypeLabel: string
  name: string
  compiledPrompt: string
  modelId: string
  version: number
  /** 'PRIVATE' | 'PUBLIC' — PUBLIC shows a "published" badge + is in the shared library. */
  visibility?: string
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
  const [query, setQuery] = useState('')

  useEffect(() => {
    setItems(recipes)
  }, [recipes])

  const handleDeleted = (id: string) => {
    setItems((prev) => prev.filter((recipe) => recipe.id !== id))
  }

  const visibleItems = useMemo(
    () =>
      items.filter(
        (recipe) =>
          (typeFilter === 'ALL' || recipe.outputType === typeFilter) &&
          `${recipe.name} ${recipe.compiledPrompt}`
            .toLocaleLowerCase(locale)
            .includes(query.trim().toLocaleLowerCase(locale)),
      ),
    [items, typeFilter, query, locale],
  )

  return (
    <section className="@container space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
          <Search
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('searchTemplates')}
            placeholder={t('searchTemplates')}
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <nav
          aria-label={t('typeFilterLabel')}
          className="flex flex-wrap gap-1.5"
        >
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
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm leading-6 text-muted-foreground">
          {t('typeFilterEmpty')}
          {(query || typeFilter !== 'ALL') && (
            <div className="mt-3">
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setTypeFilter('ALL')
                }}
              >
                {t('clearFilters')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="columns-1 gap-4 @xl:columns-2 @4xl:columns-3">
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
   requires literal class names. Exported so other "pick a prompt template"
   surfaces (e.g. the canvas prompt bar's template popover — 无封面走
   /prompts 现有的字形兜底) reuse
   the exact same fallback instead of re-deriving their own palette. */
export const FALLBACK_WASH_CLASSES: Record<OutputType, string> = {
  IMAGE: 'bg-modality-image/10',
  VIDEO: 'bg-modality-video/10',
  AUDIO: 'bg-modality-audio/10',
  MODEL_3D: 'bg-muted/30',
}

export const FALLBACK_ICON_CLASSES: Record<OutputType, string> = {
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
  const [detailMode, setDetailMode] = useState<'view' | 'edit' | 'use'>('view')
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
      <article className="group relative mb-4 flex break-inside-avoid flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-fast hover:border-foreground/30">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              aria-label={t('deleteAction')}
              className="absolute right-2 top-2 z-10 inline-flex size-9 items-center justify-center rounded-full bg-background/90 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-11"
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
        {recipe.coverThumbnailUrl && !imageFailed && (
          <button
            type="button"
            aria-label={`${t('viewDetail')}: ${title}`}
            onClick={() => {
              setDetailMode('view')
              setDetailOpen(true)
            }}
            className="aspect-video overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives */}
            <img
              src={recipe.coverThumbnailUrl}
              alt={title}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-full object-cover"
            />
          </button>
        )}

        <div className="flex flex-1 flex-col gap-3 p-5">
          <OutputTypeChip
            outputType={recipe.outputType}
            label={recipe.outputTypeLabel}
            className="w-fit"
          />
          <button
            type="button"
            onClick={() => {
              setDetailMode('view')
              setDetailOpen(true)
            }}
            className="space-y-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${t('viewDetail')}: ${title}`}
          >
            <h2 className="line-clamp-2 pr-5 text-base font-semibold">
              {title}
            </h2>
            <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {recipe.compiledPrompt}
            </p>
          </button>
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t('templateMeta', {
                model: recipe.modelId,
                version: recipe.version,
              })}
            </span>
            <span aria-hidden>·</span>
            <span>{formattedDate}</span>
            {recipe.visibility === RECIPE_VISIBILITY.PUBLIC && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                <Globe className="size-3" />
                {t('publishedBadge')}
              </span>
            )}
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('editAction')}
            onClick={() => {
              setDetailMode('edit')
              setDetailOpen(true)
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <CopyPromptButton
            prompt={recipe.compiledPrompt}
            className="ml-auto"
          />
          <Button
            variant="secondary"
            onClick={() => {
              setDetailMode('use')
              setDetailOpen(true)
            }}
          >
            {t('useAction')}
          </Button>
        </footer>
      </article>

      <PromptTemplateDetailDialog
        recipe={recipe}
        locale={locale}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDeleted={onDeleted}
        initialMode={detailMode}
      />
    </>
  )
}
