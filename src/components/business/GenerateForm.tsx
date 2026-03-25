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

import {
  API_USAGE,
  DEFAULT_ASPECT_RATIO,
  GENERATION_LIMITS,
  IMAGE_SIZES,
  type AspectRatio,
} from '@/constants/config'
import {
  AI_MODELS,
  getModelMessageKey,
  isBuiltInModel,
  MODEL_OPTIONS,
} from '@/constants/models'
import {
  getDefaultProviderConfig,
  getProviderLabel,
} from '@/constants/providers'
import { isCjkLocale } from '@/i18n/routing'

import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import { PromptEnhanceButton } from '@/components/business/PromptEnhanceButton'
import { PromptComparisonPanel } from '@/components/business/PromptComparisonPanel'
import { ReverseEngineerPanel } from '@/components/business/ReverseEngineerPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateImage } from '@/hooks/use-generate'
import { usePromptEnhance } from '@/hooks/use-prompt-enhance'
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
  const [aspectRatio, setAspectRatio] =
    useState<AspectRatio>(DEFAULT_ASPECT_RATIO)
  const [referenceImage, setReferenceImage] = useState<string | undefined>()
  const [showReferencePanel, setShowReferencePanel] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isGenerating, error, generatedGeneration, generate } =
    useGenerateImage()
  const {
    isEnhancing,
    enhanced,
    original: enhancedOriginal,
    style: enhancedStyle,
    enhance: enhancePrompt,
    clearEnhancement,
  } = usePromptEnhance()
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
    requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    isBuiltIn: true,
    freeTier: model.freeTier,
    sourceType: 'workspace',
  }))
  const savedOptions: StudioModelOption[] = activeApiKeys.map((key) => ({
    optionId: `key:${key.id}`,
    modelId: key.modelId,
    adapterType: key.adapterType,
    providerConfig: key.providerConfig,
    requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
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
      aspectRatio,
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
    <form onSubmit={handleSubmit} className="space-y-10">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card/82 p-5 shadow-sm sm:p-6">
          <ModelSelector
            value={selectedModel.optionId}
            onChange={setSelectedOptionId}
            options={modelOptions}
          />

          <div className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-background/40 p-5">
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
                  <h3 className="font-display text-xl font-medium tracking-tight text-foreground">
                    {selectedModelLabel}
                  </h3>
                  <p className="font-serif text-sm leading-6 text-muted-foreground">
                    {selectedModelDescription}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 bg-background/70 px-3 py-1"
                >
                  {selectedRouteSourceLabel}
                </Badge>
                {!selectedModel.isBuiltIn ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-border/70 bg-background/70 px-3 py-1"
                  >
                    {t('customModelBadge')}
                  </Badge>
                ) : null}
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 bg-background/70 px-3 py-1"
                >
                  {t('providerLabel')}:{' '}
                  {getProviderLabel(selectedModel.providerConfig)}
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full bg-primary/10 px-3 py-1 text-foreground"
                >
                  {t('creditCostLabel')}:{' '}
                  {tCommon('creditCount', {
                    count: selectedModel.requestCount,
                  })}
                </Badge>
              </div>
            </div>

            <div className="mt-5 space-y-5 border-t border-border/65 pt-5">
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
                      <KeyRound className="size-4 text-primary" />
                      {t('keyStatusSavedRouteTitle')}
                    </div>
                    <p className="font-serif text-sm leading-6 text-muted-foreground">
                      {t('keyStatusSavedRouteDescription', {
                        label: selectedModel.keyLabel ?? '',
                        maskedKey: selectedModel.maskedKey ?? '****',
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sparkles className="size-4 text-primary" />
                      {t('keyStatusFallbackTitle')}
                    </div>
                    <p className="font-serif text-sm leading-6 text-muted-foreground">
                      {t('keyStatusFallbackDescription', {
                        provider: getProviderLabel(
                          selectedModel.providerConfig,
                        ),
                      })}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0 space-y-2 rounded-2xl border border-border/70 bg-secondary/18 px-3 py-3">
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

                <div className="min-w-0 space-y-2 rounded-2xl border border-border/70 bg-secondary/18 px-3 py-3">
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

                <div className="min-w-0 space-y-2 rounded-2xl border border-border/70 bg-secondary/18 px-3 py-3 sm:col-span-2">
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

                <div className="min-w-0 space-y-2 rounded-2xl border border-border/70 bg-secondary/18 px-3 py-3 sm:col-span-2 xl:col-span-4">
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

        <section className="min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card/82 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <label
                htmlFor="prompt"
                className="text-sm font-semibold text-foreground"
              >
                {t('promptLabel')}
              </label>
              <p className="font-serif text-sm leading-6 text-muted-foreground">
                {t('promptHint')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PromptEnhanceButton
                prompt={prompt}
                isEnhancing={isEnhancing}
                disabled={isGenerating}
                onEnhance={(style) =>
                  enhancePrompt(prompt, style, selectedModel?.keyId)
                }
              />
              <p className="text-xs font-medium text-muted-foreground">
                {t('promptCounter', {
                  current: prompt.length,
                  max: GENERATION_LIMITS.PROMPT_MAX_LENGTH,
                })}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Textarea
              id="prompt"
              data-onboarding="prompt"
              placeholder={t('promptPlaceholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
              disabled={isGenerating}
              className="min-h-48 resize-none rounded-3xl border-border/75 bg-background/72 px-4 py-3 font-serif"
            />
          </div>

          {enhanced && enhancedOriginal && enhancedStyle && (
            <PromptComparisonPanel
              original={enhancedOriginal}
              enhanced={enhanced}
              style={enhancedStyle}
              onUseEnhanced={(text) => {
                setPrompt(text)
                clearEnhancement()
              }}
              onDismiss={clearEnhancement}
            />
          )}

          <div className="mt-5 rounded-3xl border border-border/70 bg-background/46 p-4">
            <button
              type="button"
              onClick={() => setShowReferencePanel((value) => !value)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {t('referenceTitle')}
                </p>
                <p className="font-serif text-sm leading-6 text-muted-foreground">
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
                  <div className="relative inline-flex overflow-hidden rounded-2xl border border-border/75 bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={referenceImage}
                      alt={t('referencePreviewAlt')}
                      className="h-36 w-auto object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setReferenceImage(undefined)}
                      className="absolute right-3 top-3 rounded-full border border-border/75 bg-background/92 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
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
                      'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                      isDragging
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border/60 bg-background/60 hover:border-primary/30 hover:bg-primary/3',
                    )}
                  >
                    <Upload className="size-5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {t('referenceUploadAction')}
                    </p>
                    <p className="font-serif text-xs text-muted-foreground">
                      {t('referenceUploadFormats')}
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  aria-label={t('referenceImageLabel')}
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) await handleFileChange(file)
                  }}
                />
              </div>
            ) : null}
          </div>

          {/* Aspect Ratio Selector */}
          <div className="mt-5 rounded-2xl border border-border/50 bg-background/40 p-4">
            <p
              className={cn(
                'mb-3 text-xs font-semibold text-muted-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-[0.18em]',
              )}
            >
              {t('aspectRatioLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(IMAGE_SIZES) as AspectRatio[]).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setAspectRatio(ar)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    aspectRatio === ar
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
                  )}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {/* Reverse Engineer Panel */}
          <div className="mt-5 rounded-2xl border border-border/50 bg-background/40 p-4">
            <ReverseEngineerPanel
              selectedModels={
                selectedModel
                  ? [
                      {
                        modelId: selectedModel.modelId,
                        apiKeyId: selectedModel.keyId,
                      },
                    ]
                  : undefined
              }
            />
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-primary/15 bg-primary/5 p-5 sm:p-6">
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
            <p className="max-w-2xl font-serif text-sm leading-6 text-foreground">
              {t('ctaSectionDescription')}
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!prompt.trim() || isGenerating}
            className="h-11 rounded-full px-6"
            data-onboarding="generate"
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
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{t('errorTitle')}</p>
            <p>{error}</p>
            {(error.includes('Free tier limit') ||
              error.includes('bind your own API key') ||
              error.includes('API key')) && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {t('freeQuotaGuide.title')}
                </p>
                <ol className="list-inside list-decimal space-y-0.5">
                  <li>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      {t('freeQuotaGuide.step1')}
                    </a>
                  </li>
                  <li>{t('freeQuotaGuide.step2')}</li>
                </ol>
              </div>
            )}
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
          <div className="animate-in fade-in-0 zoom-in-95 overflow-hidden rounded-3xl border border-border/60 bg-card/86 shadow-sm duration-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generatedGeneration.url}
              alt={generatedGeneration.prompt}
              className="h-auto w-full object-cover"
            />

            <div className="space-y-4 border-t border-border/75 p-5 sm:p-6">
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
                <p className="font-serif text-sm leading-6 text-foreground">
                  {generatedGeneration.prompt}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-border/75 bg-background/72 px-3 py-1"
                >
                  {t('resultModelLabel')}: {generatedModelLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full border-border/75 bg-background/72 px-3 py-1"
                >
                  {t('resultProviderLabel')}: {generatedGeneration.provider}
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full bg-primary/10 px-3 py-1 text-foreground"
                >
                  {t('resultCreditLabel')}:{' '}
                  {tCommon('creditCount', {
                    count: generatedGeneration.requestCount,
                  })}
                </Badge>
              </div>

              <p className="font-serif text-sm text-muted-foreground">
                {t('resultStorageNote')}
              </p>

              {selectedModel?.freeTier &&
                selectedModel.sourceType === 'workspace' && (
                  <p className="font-serif text-xs text-muted-foreground/70">
                    {t('upgradeHint')}
                  </p>
                )}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/3 p-6">
            <div className="flex items-start gap-4">
              <span className="rounded-2xl bg-primary/10 p-3 text-primary">
                <ImageIcon className="size-5" />
              </span>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-medium text-foreground">
                  {t('resultEmptyTitle')}
                </h3>
                <p className="font-serif text-sm leading-6 text-muted-foreground">
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
