'use client'

import { useCallback, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  KeyRound,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { DEFAULT_ASPECT_RATIO, GENERATION_LIMITS } from '@/constants/config'
import {
  AI_MODELS,
  getModelById,
  getModelMessageKey,
  isBuiltInModel,
  MODEL_OPTIONS,
} from '@/constants/models'
import {
  getAdapterDefaultCost,
  getDefaultProviderConfig,
  getProviderLabel,
} from '@/constants/providers'
import { isCjkLocale } from '@/i18n/routing'

import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateImage } from '@/hooks/use-generate'
import { cn } from '@/lib/utils'

type MessageGetter = (
  key: string,
  values?: Record<string, string | number>,
) => string

function getTranslatedModelLabel(
  tModels: MessageGetter,
  modelId: string,
): string {
  if (isBuiltInModel(modelId)) {
    return tModels(`${getModelMessageKey(modelId)}.label`)
  }

  return modelId
}

function getTranslatedModelDescription(
  t: MessageGetter,
  tModels: MessageGetter,
  model: StudioModelOption,
): string {
  if (isBuiltInModel(model.modelId)) {
    return tModels(`${getModelMessageKey(model.modelId)}.description`)
  }

  return t('modelCustomDescription', {
    provider: getProviderLabel(model.providerConfig),
  })
}

export function GenerateForm() {
  const [prompt, setPrompt] = useState('')
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    `workspace:${AI_MODELS.SDXL}`,
  )
  const [referenceImage, setReferenceImage] = useState<string | undefined>()
  const [showReferencePanel, setShowReferencePanel] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isGenerating, error, generatedGeneration, generate } =
    useGenerateImage()
  const { keys: apiKeys } = useApiKeysContext()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('StudioForm')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  const activeApiKeys = apiKeys.filter((key) => key.isActive)
  const builtInOptions: StudioModelOption[] = MODEL_OPTIONS.map((model) => ({
    optionId: `workspace:${model.id}`,
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: model.providerConfig,
    cost: model.cost,
    isBuiltIn: true,
    sourceType: 'workspace',
  }))
  const savedOptions: StudioModelOption[] = activeApiKeys.map((key) => ({
    optionId: `key:${key.id}`,
    modelId: key.modelId,
    adapterType: key.adapterType,
    providerConfig: key.providerConfig,
    cost:
      getModelById(key.modelId)?.cost ?? getAdapterDefaultCost(key.adapterType),
    isBuiltIn: isBuiltInModel(key.modelId),
    sourceType: 'saved',
    keyId: key.id,
    keyLabel: key.label,
    maskedKey: key.maskedKey,
  }))
  const modelOptions = [...builtInOptions, ...savedOptions]
  const selectedModel =
    modelOptions.find((option) => option.optionId === selectedOptionId) ??
    modelOptions[0]

  const generatedModelLabel = generatedGeneration
    ? getTranslatedModelLabel(tModels, generatedGeneration.model)
    : null

  const loadImageAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFileChange = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const base64 = await loadImageAsBase64(file)
      setReferenceImage(base64)
    },
    [loadImageAsBase64],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) await handleFileChange(file)
    },
    [handleFileChange],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!prompt.trim() || isGenerating || !selectedModel) return

    await generate({
      prompt: prompt.trim(),
      modelId: selectedModel.modelId,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      referenceImage,
      apiKeyId: selectedModel.keyId,
    })
  }

  if (!selectedModel) {
    return null
  }

  const selectedModelLabel = getTranslatedModelLabel(
    tModels,
    selectedModel.modelId,
  )
  const selectedModelDescription = getTranslatedModelDescription(
    t,
    tModels,
    selectedModel,
  )
  const selectedAdapterLabel = getProviderLabel(
    getDefaultProviderConfig(selectedModel.adapterType),
  )
  const selectedRouteSourceLabel = t(`routeSources.${selectedModel.sourceType}`)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-[1.75rem] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
          <ModelSelector
            value={selectedModel.optionId}
            onChange={setSelectedOptionId}
            options={modelOptions}
          />

          <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-secondary/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-[0.18em]',
                  )}
                >
                  {t('selectedModelLabel')}
                </p>
                <div className="space-y-2">
                  <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">
                    {selectedModelLabel}
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {selectedModelDescription}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {selectedRouteSourceLabel}
                </Badge>
                {!selectedModel.isBuiltIn ? (
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {t('customModelBadge')}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t('providerLabel')}:{' '}
                  {getProviderLabel(selectedModel.providerConfig)}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {t('creditCostLabel')}:{' '}
                  {tCommon('creditCount', { count: selectedModel.cost })}
                </Badge>
              </div>
            </div>

            <div className="mt-4 space-y-4 rounded-[1.35rem] border border-border/70 bg-background/80 p-4">
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-[0.18em]',
                  )}
                >
                  {t('keyStatusLabel')}
                </p>
                {selectedModel.sourceType === 'saved' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <KeyRound className="size-4 text-emerald-600" />
                      {t('keyStatusSavedRouteTitle')}
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {t('keyStatusSavedRouteDescription', {
                        label: selectedModel.keyLabel ?? '',
                        maskedKey: selectedModel.maskedKey ?? '****',
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sparkles className="size-4 text-chart-1" />
                      {t('keyStatusFallbackTitle')}
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {t('keyStatusFallbackDescription', {
                        provider: getProviderLabel(
                          selectedModel.providerConfig,
                        ),
                      })}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2 rounded-[1.15rem] border border-border/70 bg-secondary/25 px-3 py-3">
                  <p
                    className={cn(
                      'text-[11px] font-semibold text-muted-foreground',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-[0.14em]',
                    )}
                  >
                    {t('routeSourceLabel')}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedRouteSourceLabel}
                  </p>
                </div>

                <div className="space-y-2 rounded-[1.15rem] border border-border/70 bg-secondary/25 px-3 py-3">
                  <p
                    className={cn(
                      'text-[11px] font-semibold text-muted-foreground',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-[0.14em]',
                    )}
                  >
                    {t('adapterLabel')}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedAdapterLabel}
                  </p>
                </div>

                <div className="space-y-2 rounded-[1.15rem] border border-border/70 bg-secondary/25 px-3 py-3 sm:col-span-2">
                  <p
                    className={cn(
                      'text-[11px] font-semibold text-muted-foreground',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-[0.14em]',
                    )}
                  >
                    {t('providerEndpointLabel')}
                  </p>
                  <p className="truncate font-mono text-xs text-foreground">
                    {selectedModel.providerConfig.baseUrl}
                  </p>
                </div>

                <div className="space-y-2 rounded-[1.15rem] border border-border/70 bg-secondary/25 px-3 py-3 sm:col-span-2 xl:col-span-4">
                  <p
                    className={cn(
                      'text-[11px] font-semibold text-muted-foreground',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-[0.14em]',
                    )}
                  >
                    {t('modelIdLabel')}
                  </p>
                  <p className="truncate font-mono text-xs text-foreground">
                    {selectedModel.modelId}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <label
                htmlFor="prompt"
                className="text-sm font-semibold text-foreground"
              >
                {t('promptLabel')}
              </label>
              <p className="text-sm leading-6 text-muted-foreground">
                {t('promptHint')}
              </p>
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              {t('promptCounter', {
                current: prompt.length,
                max: GENERATION_LIMITS.PROMPT_MAX_LENGTH,
              })}
            </p>
          </div>

          <div className="mt-4">
            <Textarea
              id="prompt"
              placeholder={t('promptPlaceholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
              disabled={isGenerating}
              className="min-h-48 resize-none rounded-[1.5rem] border-border/70 bg-background/80 px-4 py-3"
            />
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-secondary/25 p-4">
            <button
              type="button"
              onClick={() => setShowReferencePanel((value) => !value)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {t('referenceTitle')}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {referenceImage
                    ? t('referenceSelectedDescription')
                    : t('referenceIdleDescription')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {referenceImage ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {t('referenceBadge')}
                  </Badge>
                ) : null}
                {showReferencePanel ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {showReferencePanel ? (
              <div className="mt-4 border-t border-border/70 pt-4">
                {referenceImage ? (
                  <div className="relative inline-flex overflow-hidden rounded-[1.25rem] border border-border/70 bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={referenceImage}
                      alt={t('referencePreviewAlt')}
                      className="h-36 w-auto object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setReferenceImage(undefined)}
                      className="absolute right-3 top-3 rounded-full border border-border/70 bg-background/90 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                      aria-label={t('referenceRemoveLabel')}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        fileInputRef.current?.click()
                      }
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-[1.35rem] border-2 border-dashed px-6 py-10 text-center transition-colors',
                      isDragging
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border/80 bg-background/70 hover:border-primary/40 hover:bg-secondary/25',
                    )}
                  >
                    <Upload className="size-5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {t('referenceUploadAction')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('referenceUploadFormats')}
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) await handleFileChange(file)
                  }}
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-[1.75rem] border border-border/70 bg-secondary/25 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p
              className={cn(
                'text-xs font-semibold text-muted-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-[0.18em]',
              )}
            >
              {t('ctaSectionLabel')}
            </p>
            <p className="max-w-2xl text-sm leading-6 text-foreground">
              {t('ctaSectionDescription')}
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!prompt.trim() || isGenerating}
            className="h-11 rounded-full px-6"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('ctaLoadingLabel')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {t('ctaLabel')}
              </>
            )}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-3 rounded-[1.5rem] border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{t('errorTitle')}</p>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <p
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              isDenseLocale
                ? 'tracking-normal normal-case'
                : 'uppercase tracking-[0.18em]',
            )}
          >
            {t('resultLabel')}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('resultDescription')}
          </p>
        </div>

        {generatedGeneration ? (
          <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-sm animate-in fade-in-0 zoom-in-95 duration-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generatedGeneration.url}
              alt={generatedGeneration.prompt}
              className="h-auto w-full object-cover"
            />

            <div className="space-y-4 border-t border-border/70 p-5 sm:p-6">
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-[0.18em]',
                  )}
                >
                  {t('resultPromptLabel')}
                </p>
                <p className="text-sm leading-6 text-foreground">
                  {generatedGeneration.prompt}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t('resultModelLabel')}: {generatedModelLabel}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t('resultProviderLabel')}: {generatedGeneration.provider}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {t('resultCreditLabel')}:{' '}
                  {tCommon('creditCount', {
                    count: generatedGeneration.creditsCost,
                  })}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                {t('resultStorageNote')}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-border/80 bg-card/70 p-6">
            <div className="flex items-start gap-4">
              <span className="rounded-[1.15rem] bg-secondary p-3 text-foreground">
                <ImageIcon className="size-5" />
              </span>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-semibold text-foreground">
                  {t('resultEmptyTitle')}
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t('resultEmptyDescription')}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </form>
  )
}
