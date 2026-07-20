'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUpRight, FileText, Save, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  StudioPanelHeader,
  studioDialogBaseClass,
  studioDialogBodyClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import { useStudioGen } from '@/contexts/studio-context'
import { useInspirations } from '@/hooks/prompts/use-inspirations'
import { useRecipes } from '@/hooks/prompts/use-recipes'
import { createRecipeAPI } from '@/lib/api-client/recipes'
import type {
  CreateRecipeRequest,
  InspirationRecord,
  OutputType,
  RecipeRecord,
} from '@/types'

const RECENT_TEMPLATE_COUNT = 5
const DEFAULT_TEMPLATE_OUTPUT_TYPE: OutputType = 'IMAGE'
const TEMPLATE_NAME_MAX_LENGTH = 48
const INSPIRATION_PREVIEW_MAX = 160

const RELATIVE_TIME_UNITS: Array<{
  unit: Intl.RelativeTimeFormatUnit
  milliseconds: number
}> = [
  { unit: 'year', milliseconds: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', milliseconds: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', milliseconds: 24 * 60 * 60 * 1000 },
  { unit: 'hour', milliseconds: 60 * 60 * 1000 },
  { unit: 'minute', milliseconds: 60 * 1000 },
]

type PickerTab = 'mine' | 'inspiration'

interface PromptTemplatePickerProps {
  currentModelId?: string
  currentOutputType?: OutputType
  currentParams?: Record<string, unknown>
  currentPrompt?: string
  currentProvider?: string
  onApply: (recipe: RecipeRecord) => void
  /**
   * Called when the user picks an inspiration prompt.
   * If omitted, the inspiration tab is hidden.
   */
  onApplyInspiration?: (inspiration: InspirationRecord) => void
}

function getDefaultTemplateName(prompt: string): string {
  const firstLine = prompt
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) return ''

  const normalized = firstLine.replace(/\s+/g, ' ')
  return normalized.length > TEMPLATE_NAME_MAX_LENGTH
    ? `${normalized.slice(0, TEMPLATE_NAME_MAX_LENGTH)}...`
    : normalized
}

function getRelativeTemplateTime(createdAt: string, locale: string): string {
  const timestamp = new Date(createdAt).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const deltaMs = timestamp - Date.now()
  const absoluteDeltaMs = Math.abs(deltaMs)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const unit =
    RELATIVE_TIME_UNITS.find((item) => absoluteDeltaMs >= item.milliseconds) ??
    RELATIVE_TIME_UNITS[RELATIVE_TIME_UNITS.length - 1]

  return formatter.format(Math.round(deltaMs / unit.milliseconds), unit.unit)
}

export function PromptTemplatePicker({
  currentModelId,
  currentOutputType = DEFAULT_TEMPLATE_OUTPUT_TYPE,
  currentParams,
  currentPrompt,
  currentProvider,
  onApply,
  onApplyInspiration,
}: PromptTemplatePickerProps) {
  const t = useTranslations('PromptLibrary')
  const tModels = useTranslations('Models')
  const locale = useLocale()
  const router = useRouter()
  const { lastGeneration } = useStudioGen()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PickerTab>('mine')
  const [isSavingCurrent, setIsSavingCurrent] = useState(false)
  const { recipes, isLoading, addRecipe } = useRecipes()
  const trimmedCurrentPrompt = currentPrompt?.trim() ?? ''
  const canSaveCurrent = Boolean(
    trimmedCurrentPrompt && currentModelId && currentProvider,
  )
  const showInspiration = Boolean(onApplyInspiration)

  const { recentRecipes, restRecipes } = useMemo(() => {
    if (recipes.length === 0) return { recentRecipes: [], restRecipes: [] }

    const sorted = [...recipes].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    return {
      recentRecipes: sorted.slice(0, RECENT_TEMPLATE_COUNT),
      restRecipes: sorted.slice(RECENT_TEMPLATE_COUNT),
    }
  }, [recipes])

  const runRecipeAction = (recipe: RecipeRecord) => {
    onApply(recipe)
    setOpen(false)
  }

  const runInspirationAction = (inspiration: InspirationRecord) => {
    onApplyInspiration?.(inspiration)
    setOpen(false)
  }

  const handleManagePrompts = () => {
    setOpen(false)
    router.push(ROUTES.PROMPTS)
  }

  const handleSaveCurrentPrompt = async () => {
    if (!trimmedCurrentPrompt) {
      toast.error(t('createPromptRequired'))
      return
    }
    if (!currentModelId || !currentProvider) {
      toast.error(t('providerRequired'))
      return
    }

    const payload: CreateRecipeRequest = {
      name: getDefaultTemplateName(trimmedCurrentPrompt),
      outputType: currentOutputType,
      compiledPrompt: trimmedCurrentPrompt,
      modelId: currentModelId,
      provider: currentProvider,
      params: currentParams,
      // Associate the most recent generation so saved templates inherit a cover
      // thumbnail in listRecipes. Undefined when nothing has been generated yet
      // → no parentGenerationId → FileText fallback (schema is string-optional).
      parentGenerationId: lastGeneration?.id,
    }

    setIsSavingCurrent(true)
    try {
      const result = await createRecipeAPI(payload)
      if (result.success && result.data) {
        // The POST response has no listRecipes cover join, so derive the cover
        // from the generation we just linked (mirrors the service's
        // thumbnailUrl ?? previewUrl ?? url). The optimistically-inserted row
        // shows the cover immediately and stays consistent once listRecipes
        // refetches; null → FileText fallback when nothing was generated.
        const optimisticCover =
          result.data.coverThumbnailUrl ??
          lastGeneration?.thumbnailUrl ??
          lastGeneration?.previewUrl ??
          lastGeneration?.url ??
          null
        addRecipe({ ...result.data, coverThumbnailUrl: optimisticCover })
        toast.success(t('saveTemplateSuccess'))
        return
      }
      toast.error(result.error ?? t('saveTemplateFailed'))
    } finally {
      setIsSavingCurrent(false)
    }
  }

  const renderRecipeItem = (recipe: RecipeRecord) => {
    const modelLabel = getTranslatedModelLabel(tModels, recipe.modelId)
    const relativeTime = getRelativeTemplateTime(recipe.createdAt, locale)
    const searchValue = [
      recipe.id,
      recipe.name,
      recipe.compiledPrompt,
      recipe.modelId,
      recipe.provider,
    ]
      .filter((v): v is string => Boolean(v))
      .join(' ')

    return (
      <CommandItem
        key={recipe.id}
        value={searchValue}
        onSelect={() => runRecipeAction(recipe)}
        className="group min-h-14 items-center gap-3 px-3 py-2.5"
      >
        {recipe.coverThumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- stored generation thumbnails are already optimized derivatives
          <img
            src={recipe.coverThumbnailUrl}
            alt=""
            loading="lazy"
            className="size-9 shrink-0 rounded-md object-cover ring-1 ring-inset ring-border/40 transition duration-fast ease-standard group-hover:brightness-110 group-hover:ring-border group-data-[selected=true]:brightness-110 group-data-[selected=true]:ring-border"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/65 text-muted-foreground ring-1 ring-inset ring-border/40 transition-colors duration-fast ease-standard group-hover:bg-background/80 group-hover:text-foreground group-hover:ring-border group-data-[selected=true]:bg-background/80 group-data-[selected=true]:text-foreground group-data-[selected=true]:ring-border">
            <FileText className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 min-w-0 text-sm font-semibold">
            {recipe.name || recipe.modelId}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">{modelLabel}</span>
            {relativeTime && (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">{relativeTime}</span>
              </>
            )}
          </span>
        </span>
      </CommandItem>
    )
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 rounded-full px-3 text-sm text-muted-foreground',
            'transition-[color,background-color,border-color,box-shadow] duration-200',
            'hover:bg-muted/35 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20',
            'data-[state=open]:bg-muted/55 data-[state=open]:text-foreground',
          )}
        >
          <FileText className="size-4" />
          {t('templatePicker')}
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        className={cn(
          studioDialogBaseClass,
          'flex w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] flex-col sm:w-[min(640px,calc(100vw-4rem))] sm:!max-w-xl',
        )}
        mobileBodyClassName="studio-scrollbar px-0 pt-0"
      >
        <StudioPanelHeader icon={<FileText className="size-3.5" />}>
          {t('templatePickerTitle')}
        </StudioPanelHeader>
        <ResponsiveDialogDescription className="sr-only">
          {t('templatePickerTitle')}
        </ResponsiveDialogDescription>
        <div
          className={cn(
            studioDialogBodyClass,
            'studio-scrollbar flex min-h-0 flex-1 flex-col pt-3',
          )}
        >
          {showInspiration ? (
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as PickerTab)}
              className="gap-0"
            >
              <div className="border-b border-border/60 pb-2">
                <TabsList
                  variant="line"
                  className="h-8 w-full justify-start gap-3"
                >
                  <TabsTrigger value="mine" className="flex-none px-2">
                    {t('tabMine')}
                  </TabsTrigger>
                  <TabsTrigger value="inspiration" className="flex-none px-2">
                    <Sparkles className="size-3.5" />
                    {t('tabInspiration')}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="mine" className="mt-0">
                <MineTabBody
                  canSaveCurrent={canSaveCurrent}
                  isSavingCurrent={isSavingCurrent}
                  trimmedCurrentPrompt={trimmedCurrentPrompt}
                  onSaveCurrent={() => void handleSaveCurrentPrompt()}
                  isLoading={isLoading}
                  recentRecipes={recentRecipes}
                  restRecipes={restRecipes}
                  renderRecipeItem={renderRecipeItem}
                />
              </TabsContent>

              <TabsContent value="inspiration" className="mt-0">
                <InspirationTabBody onPick={runInspirationAction} />
              </TabsContent>
            </Tabs>
          ) : (
            <MineTabBody
              canSaveCurrent={canSaveCurrent}
              isSavingCurrent={isSavingCurrent}
              trimmedCurrentPrompt={trimmedCurrentPrompt}
              onSaveCurrent={() => void handleSaveCurrentPrompt()}
              isLoading={isLoading}
              recentRecipes={recentRecipes}
              restRecipes={restRecipes}
              renderRecipeItem={renderRecipeItem}
            />
          )}
          <div className="mt-3 border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleManagePrompts}
              className="min-h-11 w-full justify-center gap-2 rounded-full text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              {t('manageInPrompts')}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface MineTabBodyProps {
  canSaveCurrent: boolean
  isSavingCurrent: boolean
  trimmedCurrentPrompt: string
  onSaveCurrent: () => void
  isLoading: boolean
  recentRecipes: RecipeRecord[]
  restRecipes: RecipeRecord[]
  renderRecipeItem: (recipe: RecipeRecord) => ReactNode
}

function MineTabBody({
  canSaveCurrent,
  isSavingCurrent,
  trimmedCurrentPrompt,
  onSaveCurrent,
  isLoading,
  recentRecipes,
  restRecipes,
  renderRecipeItem,
}: MineTabBodyProps) {
  const t = useTranslations('PromptLibrary')
  const hasRecipes = recentRecipes.length + restRecipes.length > 0
  return (
    <>
      <div className="border-b border-border/60 py-3">
        <Button
          type="button"
          variant="ghost"
          disabled={!canSaveCurrent || isSavingCurrent}
          onClick={onSaveCurrent}
          className={cn(
            'min-h-11 w-full justify-start gap-2 rounded-full border border-border/40 bg-muted/65 px-3 text-sm',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            'disabled:pointer-events-none disabled:opacity-45',
          )}
        >
          {isSavingCurrent ? (
            <Spinner size="md" />
          ) : (
            <Save className="size-4" />
          )}
          {isSavingCurrent ? t('savingCurrentPrompt') : t('saveCurrentPrompt')}
        </Button>
        {!trimmedCurrentPrompt && (
          <p className="px-3 pt-2 text-xs text-muted-foreground/75">
            {t('saveCurrentPromptEmpty')}
          </p>
        )}
      </div>
      <Command className="overflow-visible rounded-none bg-transparent">
        <CommandInput
          placeholder={t('searchPlaceholder')}
          className="h-10 text-sm"
        />
        <CommandList className="max-h-none overflow-visible overscroll-auto">
          {isLoading && !hasRecipes ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <Spinner size="lg" />
              <span>{t('loadingTemplates')}</span>
            </div>
          ) : (
            <>
              <CommandEmpty>{t('emptyTitle')}</CommandEmpty>
              {recentRecipes.length > 0 && (
                <CommandGroup heading={t('recentTemplates')}>
                  {recentRecipes.map(renderRecipeItem)}
                </CommandGroup>
              )}
              {restRecipes.length > 0 && (
                <CommandGroup heading={t('allTemplates')}>
                  {restRecipes.map(renderRecipeItem)}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </>
  )
}

interface InspirationTabBodyProps {
  onPick: (inspiration: InspirationRecord) => void
}

function InspirationTabBody({ onPick }: InspirationTabBodyProps) {
  const t = useTranslations('PromptLibrary')
  const { items, isLoading, error, filters, setQuery } = useInspirations()

  return (
    <div className="flex flex-col">
      <div className="border-b border-border/60 py-2">
        <input
          type="search"
          inputMode="search"
          value={filters.query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('inspirationSearchPlaceholder')}
          maxLength={200}
          className={cn(
            'h-10 w-full rounded-md border-0 bg-transparent px-3 text-sm outline-none',
            'placeholder:text-muted-foreground/70',
            'focus-visible:ring-0',
          )}
        />
      </div>

      <div>
        {error ? (
          <div className="px-4 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : isLoading && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <Spinner size="lg" />
            <span>{t('inspirationLoadingMore')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t('inspirationEmptyTitle')}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((inspiration) => (
              <li key={inspiration.id}>
                <button
                  type="button"
                  onClick={() => onPick(inspiration)}
                  className={cn(
                    'group flex w-full gap-3 px-3 py-2.5 text-left transition-colors duration-fast ease-standard',
                    'hover:bg-muted/55 focus-visible:bg-muted/55',
                    'focus-visible:outline-none',
                  )}
                >
                  {inspiration.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external host, unoptimized
                    <img
                      src={inspiration.imageUrl}
                      alt=""
                      loading="lazy"
                      className="size-12 shrink-0 rounded-md object-cover ring-1 ring-inset ring-border/40 transition duration-fast ease-standard group-hover:brightness-110 group-hover:ring-border"
                    />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted/65 text-muted-foreground ring-1 ring-inset ring-border/40 transition-colors duration-fast ease-standard group-hover:bg-background/80 group-hover:text-foreground group-hover:ring-border">
                      <Sparkles className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug text-foreground">
                      {truncatePrompt(inspiration.prompt)}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span>@{inspiration.authorName}</span>
                      {inspiration.categories[0] && (
                        <>
                          <span>/</span>
                          <span>{inspiration.categories[0]}</span>
                        </>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function truncatePrompt(prompt: string): string {
  const single = prompt.replace(/\s+/g, ' ').trim()
  return single.length > INSPIRATION_PREVIEW_MAX
    ? `${single.slice(0, INSPIRATION_PREVIEW_MAX).trimEnd()}...`
    : single
}
