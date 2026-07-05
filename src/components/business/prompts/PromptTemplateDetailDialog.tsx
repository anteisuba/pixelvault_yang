'use client'
/* eslint-disable @next/next/no-img-element -- stored generation thumbnails are already optimized R2 derivatives */

import { useEffect, useState } from 'react'
import {
  Copy,
  Globe,
  ImageOff,
  Loader2,
  Lock,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { MODEL_OPTIONS } from '@/constants/models'
import {
  PROMPT_TEMPLATE_OUTPUT_TYPES,
  PROMPT_OUTPUT_TYPE_LABEL_KEYS,
  RECIPE_VISIBILITY,
} from '@/constants/prompt-library'
import { getDefaultProviderConfig } from '@/constants/providers'
import { ROUTES } from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import { useRouter } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import {
  deleteRecipeAPI,
  getRecipeAPI,
  listRecipeGenerationsAPI,
  setRecipeVisibilityAPI,
  updateRecipeAPI,
} from '@/lib/api-client/recipes'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import { getTranslatedModelLabel } from '@/lib/model-options'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { OutputTypeChip } from '@/components/business/prompts/OutputTypeChip'
import type { CreateRecipeRequest, GenerationRecord, OutputType } from '@/types'

export interface PromptTemplateDetailRecipe {
  id: string
  name: string
  modelId: string
  outputType: OutputType
  outputTypeLabel: string
  version: number
  createdAt: string
  compiledPrompt: string
  /** 'PRIVATE' | 'PUBLIC' — drives the publish/unpublish toggle. */
  visibility?: string
}

interface PromptTemplateDetailDialogProps {
  recipe: PromptTemplateDetailRecipe
  locale: AppLocale
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: (id: string) => void
}

const MODEL_CHOICES = MODEL_OPTIONS.filter((option) => option.available)

function getModelOption(modelId: string) {
  return MODEL_OPTIONS.find((option) => option.id === modelId)
}

function getStudioRoute(outputType: OutputType) {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

export function PromptTemplateDetailDialog({
  recipe,
  locale,
  open,
  onOpenChange,
  onDeleted,
}: PromptTemplateDetailDialogProps) {
  const t = useTranslations('PromptLibrary')
  const tModels = useTranslations('Models')
  const tCommon = useTranslations('Common')

  const router = useRouter()

  const [generations, setGenerations] = useState<GenerationRecord[]>([])
  const [isLoadingAssets, setIsLoadingAssets] = useState(false)
  const [enlargedIndex, setEnlargedIndex] = useState(-1)

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [visibility, setVisibility] = useState(
    recipe.visibility ?? RECIPE_VISIBILITY.PRIVATE,
  )

  const [name, setName] = useState(recipe.name)
  const [compiledPrompt, setCompiledPrompt] = useState(recipe.compiledPrompt)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [modelId, setModelId] = useState(recipe.modelId)
  const [provider, setProvider] = useState('')
  const [outputType, setOutputType] = useState<OutputType>(recipe.outputType)
  const [version, setVersion] = useState(recipe.version)
  const [parentGenerationId, setParentGenerationId] = useState<string | null>(
    null,
  )

  const title = name || recipe.modelId
  const formattedDate = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(recipe.createdAt))
  const enlarged = enlargedIndex >= 0 ? generations[enlargedIndex] : undefined

  useEffect(() => {
    if (!open) {
      setIsEditing(false)
      setEnlargedIndex(-1)
      return
    }

    let cancelled = false
    setIsLoadingAssets(true)
    void (async () => {
      const [assetsResult, detailResult] = await Promise.all([
        listRecipeGenerationsAPI(recipe.id),
        getRecipeAPI(recipe.id),
      ])
      if (cancelled) return

      if (assetsResult.success && assetsResult.data) {
        setGenerations(assetsResult.data)
      }
      if (detailResult.success && detailResult.data) {
        const detail = detailResult.data
        setName(detail.name)
        setCompiledPrompt(detail.compiledPrompt)
        setNegativePrompt(detail.negativePrompt ?? '')
        setModelId(detail.modelId)
        setProvider(detail.provider)
        setOutputType(detail.outputType)
        setVersion(detail.version)
        setParentGenerationId(detail.parentGenerationId)
        if (detail.visibility) setVisibility(detail.visibility)
      }
      setIsLoadingAssets(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, recipe.id])

  const resetForm = () => {
    setName(recipe.name)
    setCompiledPrompt(recipe.compiledPrompt)
  }

  const selectModel = (nextModelId: string) => {
    setModelId(nextModelId)
    const option = getModelOption(nextModelId)
    if (option) setProvider(getDefaultProviderConfig(option.adapterType).label)
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(compiledPrompt)
      toast.success(t('promptCopied'))
    } catch {
      toast.error(t('inspirationCloneFailed'))
    }
  }

  const useInStudio = () => {
    const prompt = compiledPrompt.trim()
    if (!prompt) {
      toast.error(t('createPromptRequired'))
      return
    }
    window.sessionStorage.setItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY, prompt)
    router.push(getStudioRoute(outputType))
  }

  const saveChanges = async () => {
    const prompt = compiledPrompt.trim()
    if (!prompt) {
      toast.error(t('createPromptRequired'))
      return
    }
    const nextProvider = provider.trim()
    if (!nextProvider) {
      toast.error(t('providerRequired'))
      return
    }

    const payload: CreateRecipeRequest = {
      name: name.trim(),
      outputType,
      compiledPrompt: prompt,
      negativePrompt: negativePrompt.trim() || undefined,
      modelId,
      provider: nextProvider,
      parentGenerationId: parentGenerationId ?? undefined,
    }

    setIsSaving(true)
    try {
      const response = await updateRecipeAPI(recipe.id, payload)
      if (response.success && response.data) {
        toast.success(t('updateTemplateSuccess'))
        setVersion(response.data.version)
        setIsEditing(false)
        router.refresh()
        return
      }
      toast.error(response.error ?? t('updateTemplateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const togglePublish = async () => {
    const isPublic = visibility === RECIPE_VISIBILITY.PUBLIC
    const next = isPublic ? RECIPE_VISIBILITY.PRIVATE : RECIPE_VISIBILITY.PUBLIC

    setIsPublishing(true)
    try {
      const response = await setRecipeVisibilityAPI(recipe.id, next)
      if (response.success && response.data) {
        setVisibility(next)
        toast.success(isPublic ? t('unpublishSuccess') : t('publishSuccess'))
        router.refresh()
        return
      }
      toast.error(response.error ?? t('publishFailed'))
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteRecipeAPI(recipe.id)
      if (result.success) {
        toast.success(t('deleteSuccess'))
        onOpenChange(false)
        onDeleted(recipe.id)
        return
      }
      toast.error(result.error ?? t('deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const galleryPanel = (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-medium text-foreground">
          {t('generatedAssets')}
        </h3>
        {generations.length > 0 && (
          <Badge variant="outline" className="rounded-full">
            {generations.length}
          </Badge>
        )}
      </div>

      {isLoadingAssets ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('loadingAssets')}
        </div>
      ) : generations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 bg-card/50 px-5 py-10 text-center text-sm text-muted-foreground">
          <ImageOff className="size-6 text-muted-foreground/70" />
          {t('noGeneratedAssets')}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {generations.map((generation, index) => (
            <li key={generation.id}>
              <button
                type="button"
                onClick={() => setEnlargedIndex(index)}
                aria-label={t('viewDetail')}
                className="group/asset block aspect-square w-full overflow-hidden rounded-xl bg-muted/30 ring-1 ring-inset ring-border/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <img
                  src={getGenerationPreviewUrl(generation)}
                  alt={generation.prompt || generation.id}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover/asset:scale-[1.03]"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  const contentPanel = isEditing ? (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="template-detail-prompt">
          {t('createPromptLabel')}
        </label>
        <Textarea
          id="template-detail-prompt"
          value={compiledPrompt}
          onChange={(event) => setCompiledPrompt(event.target.value)}
          placeholder={t('createPromptPlaceholder')}
          maxLength={5000}
          className="h-48 max-h-[42svh] resize-y overflow-y-auto rounded-xl font-serif text-sm leading-7"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="template-detail-model">
          {t('createModelLabel')}
        </label>
        <Select value={modelId} onValueChange={selectModel}>
          <SelectTrigger
            id="template-detail-model"
            className="w-full"
            aria-label={t('createModelLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!getModelOption(modelId) && (
              <SelectItem value={modelId}>{modelId}</SelectItem>
            )}
            {MODEL_CHOICES.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {getTranslatedModelLabel(tModels, option.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            className="text-sm font-medium"
            htmlFor="template-detail-output-type"
          >
            {t('createOutputTypeLabel')}
          </label>
          <Select
            value={outputType}
            onValueChange={(value) => setOutputType(value as OutputType)}
          >
            <SelectTrigger
              id="template-detail-output-type"
              className="w-full"
              aria-label={t('createOutputTypeLabel')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Legacy recipes may still be MODEL_3D — keep the stored value
                  selectable, but don't offer 3D for new choices. */}
              {outputType === 'MODEL_3D' && (
                <SelectItem value="MODEL_3D">
                  {t(PROMPT_OUTPUT_TYPE_LABEL_KEYS.MODEL_3D)}
                </SelectItem>
              )}
              {PROMPT_TEMPLATE_OUTPUT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label
            className="text-sm font-medium"
            htmlFor="template-detail-provider"
          >
            {t('provider')}
          </label>
          <Input
            id="template-detail-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            maxLength={100}
            className="h-9"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label
          className="text-sm font-medium"
          htmlFor="template-detail-negative"
        >
          {t('createNegativePromptLabel')}
        </label>
        <Textarea
          id="template-detail-negative"
          value={negativePrompt}
          onChange={(event) => setNegativePrompt(event.target.value)}
          placeholder={t('createNegativePromptPlaceholder')}
          maxLength={1000}
          className="min-h-24 resize-y rounded-xl font-serif text-sm leading-7"
        />
      </div>
    </div>
  ) : (
    <div className="max-h-[60svh] overflow-y-auto rounded-2xl border border-border/60 bg-card/70 p-4">
      <p className="whitespace-pre-wrap font-serif text-sm leading-7 text-foreground">
        {compiledPrompt}
      </p>
    </div>
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        // While an image is enlarged, close the enlargement first instead of
        // dismissing the whole dialog (Esc / backdrop).
        if (!next && enlargedIndex >= 0) {
          setEnlargedIndex(-1)
          return
        }
        onOpenChange(next)
      }}
    >
      <ResponsiveDialogContent
        className="flex max-h-[88svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl lg:min-h-[70svh]"
        mobileBodyClassName="px-0 pt-0"
      >
        <ResponsiveDialogHeader className="shrink-0 space-y-2 border-b border-border/60 px-5 py-4 text-left sm:px-6">
          {isEditing ? (
            <Input
              aria-label={t('createNameLabel')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('createNamePlaceholder')}
              maxLength={200}
              className="h-auto rounded-xl px-3 py-2 font-display text-xl font-medium tracking-tight"
            />
          ) : (
            <ResponsiveDialogTitle className="font-display text-xl font-medium tracking-tight">
              {title}
            </ResponsiveDialogTitle>
          )}
          <ResponsiveDialogDescription className="sr-only">
            {t('templateMeta', { model: modelId, version })}
          </ResponsiveDialogDescription>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <OutputTypeChip
              outputType={outputType}
              label={t(PROMPT_OUTPUT_TYPE_LABEL_KEYS[outputType])}
            />
            <span>{t('templateMeta', { model: modelId, version })}</span>
            <span>{formattedDate}</span>
          </div>
        </ResponsiveDialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            {galleryPanel}
            {contentPanel}
          </div>
        </div>

        <ResponsiveDialogFooter className="shrink-0 gap-2 border-t border-border/60 px-5 py-3 sm:px-6">
          {isEditing ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
                disabled={isSaving}
                onClick={() => {
                  resetForm()
                  setIsEditing(false)
                }}
              >
                <X className="size-4" />
                {t('editCancel')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={isSaving}
                onClick={resetForm}
              >
                <RotateCcw className="size-4" />
                {t('editReset')}
              </Button>
              <Button
                type="button"
                className="rounded-full"
                disabled={isSaving}
                onClick={() => void saveChanges()}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {isSaving ? t('createSaving') : t('editSubmit')}
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-wrap items-center gap-2">
              <Button
                type="button"
                className="rounded-full"
                onClick={useInStudio}
              >
                <Sparkles className="size-4" />
                {t('useInStudio')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => void copyPrompt()}
              >
                <Copy className="size-4" />
                {t('copyPrompt')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="size-4" />
                {t('editAction')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={isPublishing}
                onClick={() => void togglePublish()}
                title={t('publishHint')}
              >
                {isPublishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : visibility === RECIPE_VISIBILITY.PUBLIC ? (
                  <Lock className="size-4" />
                ) : (
                  <Globe className="size-4" />
                )}
                {visibility === RECIPE_VISIBILITY.PUBLIC
                  ? isPublishing
                    ? t('unpublishing')
                    : t('unpublishAction')
                  : isPublishing
                    ? t('publishing')
                    : t('publishAction')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto rounded-full text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    {t('deleteAction')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('deleteConfirmTitle')}
                    </AlertDialogTitle>
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
            </div>
          )}
        </ResponsiveDialogFooter>

        {enlarged ? (
          <div
            role="dialog"
            aria-label={t('generatedAssets')}
            className="absolute inset-0 z-20 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm sm:p-8"
            onClick={() => setEnlargedIndex(-1)}
          >
            <img
              src={enlarged.url}
              alt={enlarged.prompt || enlarged.id}
              className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={tCommon('close')}
              className="absolute right-3 top-3 size-9 rounded-full"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
