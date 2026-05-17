'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Pencil, RotateCcw, Save, Sparkles, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { ROUTES } from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import type { AppLocale } from '@/i18n/routing'
import type { CreateRecipeRequest, OutputType } from '@/types'
import { useRouter } from '@/i18n/navigation'
import { updateRecipeAPI } from '@/lib/api-client/recipes'
import { cn } from '@/lib/utils'
import { CopyPromptButton } from '@/components/business/CopyPromptButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export interface PromptTemplateDetailRecipe {
  id: string
  name: string
  outputType: OutputType
  compiledPrompt: string
  negativePrompt: string | null
  modelId: string
  provider: string
  parentGenerationId: string | null
  version: number
  createdAt: string
}

interface PromptTemplateDetailEditorProps {
  locale: AppLocale
  recipe: PromptTemplateDetailRecipe
}

function getOutputTypeLabelKey(outputType: OutputType) {
  if (outputType === 'VIDEO') return 'outputTypeVideo'
  if (outputType === 'AUDIO') return 'outputTypeAudio'
  if (outputType === 'MODEL_3D') return 'outputType3d'
  return 'outputTypeImage'
}

function getStudioRoute(outputType: OutputType) {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

export function PromptTemplateDetailEditor({
  locale,
  recipe,
}: PromptTemplateDetailEditorProps) {
  const t = useTranslations('PromptLibrary')
  const router = useRouter()
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState(recipe.name)
  const [compiledPrompt, setCompiledPrompt] = useState(recipe.compiledPrompt)
  const [negativePrompt, setNegativePrompt] = useState(
    recipe.negativePrompt ?? '',
  )
  const [provider, setProvider] = useState(recipe.provider)
  const [version, setVersion] = useState(recipe.version)

  useEffect(() => {
    if (!isEditing) return
    promptRef.current?.focus()
  }, [isEditing])

  const resetForm = () => {
    setName(recipe.name)
    setCompiledPrompt(recipe.compiledPrompt)
    setNegativePrompt(recipe.negativePrompt ?? '')
    setProvider(recipe.provider)
  }

  const cancelEdit = () => {
    resetForm()
    setIsEditing(false)
  }

  const useInStudio = () => {
    const prompt = compiledPrompt.trim()
    if (!prompt) {
      toast.error(t('createPromptRequired'))
      return
    }
    sessionStorage.setItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY, prompt)
    router.push(getStudioRoute(recipe.outputType))
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
      outputType: recipe.outputType,
      compiledPrompt: prompt,
      negativePrompt: negativePrompt.trim() || undefined,
      modelId: recipe.modelId,
      provider: nextProvider,
      parentGenerationId: recipe.parentGenerationId ?? undefined,
    }

    setIsSaving(true)
    try {
      const response = await updateRecipeAPI(recipe.id, payload)
      if (response.success && response.data) {
        toast.success(t('updateTemplateSuccess'))
        setName(response.data.name)
        setCompiledPrompt(response.data.compiledPrompt)
        setNegativePrompt(response.data.negativePrompt ?? '')
        setProvider(response.data.provider)
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

  return (
    <section className="space-y-6">
      <div className="max-w-4xl space-y-3">
        <p className="editorial-eyebrow">{t('templatePicker')}</p>
        {isEditing ? (
          <div className="space-y-2">
            <label className="sr-only" htmlFor="recipe-detail-name">
              {t('createNameLabel')}
            </label>
            <Input
              id="recipe-detail-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('createNamePlaceholder')}
              maxLength={200}
              className="h-auto rounded-xl border-border/70 bg-card/75 px-3 py-2 font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl"
            />
          </div>
        ) : (
          <h1 className="break-words font-display text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
            {name || recipe.modelId}
          </h1>
        )}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">
            {t(getOutputTypeLabelKey(recipe.outputType))}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {t('templateMeta', {
              model: recipe.modelId,
              version,
            })}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:items-start">
        <div className="space-y-5">
          <div
            className={cn(
              'rounded-2xl border border-border/60 bg-card/82 p-5',
              isEditing && 'border-primary/35 bg-card',
            )}
          >
            {isEditing ? (
              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="recipe-detail-prompt"
                >
                  {t('createPromptLabel')}
                </label>
                <Textarea
                  ref={promptRef}
                  id="recipe-detail-prompt"
                  value={compiledPrompt}
                  onChange={(event) => setCompiledPrompt(event.target.value)}
                  placeholder={t('createPromptPlaceholder')}
                  maxLength={5000}
                  className="min-h-80 resize-y border-0 bg-transparent p-0 font-serif text-base leading-8 shadow-none focus-visible:ring-0"
                />
              </div>
            ) : (
              <p className="whitespace-pre-wrap font-serif text-base leading-8 text-foreground">
                {compiledPrompt}
              </p>
            )}
          </div>

          {isEditing ? (
            <div className="rounded-2xl border border-border/60 bg-background/50 p-5">
              <label
                className="text-sm font-medium"
                htmlFor="recipe-detail-negative-prompt"
              >
                {t('createNegativePromptLabel')}
              </label>
              <Textarea
                id="recipe-detail-negative-prompt"
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                placeholder={t('createNegativePromptPlaceholder')}
                maxLength={1000}
                className="mt-2 min-h-28 resize-y rounded-xl font-serif text-sm leading-7"
              />
            </div>
          ) : recipe.negativePrompt ? (
            <div className="rounded-2xl border border-border/60 bg-background/50 p-5">
              <p className="whitespace-pre-wrap font-serif text-sm leading-7 text-muted-foreground">
                {recipe.negativePrompt}
              </p>
            </div>
          ) : null}
        </div>

        <aside className="self-start rounded-2xl border border-border/60 bg-card/78 p-4">
          <div className="space-y-4">
            <Button
              type="button"
              className="w-full rounded-full"
              onClick={useInStudio}
            >
              <Sparkles className="size-4" />
              {t('useInStudio')}
            </Button>
            <CopyPromptButton prompt={compiledPrompt} />
            {isEditing ? (
              <div className="space-y-2 rounded-xl border border-border/60 bg-background/45 p-3">
                <Button
                  type="button"
                  className="w-full rounded-full"
                  onClick={() => void saveChanges()}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {isSaving ? t('createSaving') : t('editSubmit')}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={resetForm}
                    disabled={isSaving}
                  >
                    <RotateCcw className="size-4" />
                    {t('editReset')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-full"
                    onClick={cancelEdit}
                    disabled={isSaving}
                  >
                    <X className="size-4" />
                    {t('editCancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="size-4" />
                {t('editAction')}
              </Button>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('sourceWork')}</dt>
              <dd className="break-all">{recipe.parentGenerationId ?? '—'}</dd>
              <dt className="text-muted-foreground">{t('provider')}</dt>
              <dd>
                {isEditing ? (
                  <Input
                    id="recipe-detail-provider"
                    aria-label={t('provider')}
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    maxLength={100}
                    className="h-8"
                  />
                ) : (
                  provider
                )}
              </dd>
              <dt className="text-muted-foreground">{t('createdAt')}</dt>
              <dd>
                {new Intl.DateTimeFormat(locale, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                }).format(new Date(recipe.createdAt))}
              </dd>
            </dl>
          </div>
        </aside>
      </div>
    </section>
  )
}
