'use client'

import { useState } from 'react'
import { ImageIcon, Loader2, Sparkles, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  API_USAGE,
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
import { getProviderLabel } from '@/constants/providers'
import { isCjkLocale } from '@/i18n/routing'

import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import { PromptEnhancer } from '@/components/business/PromptEnhancer'
import { ReverseEngineerPanel } from '@/components/business/ReverseEngineerPanel'
import { AspectRatioSelector } from '@/components/ui/aspect-ratio-selector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { ErrorAlert } from '@/components/ui/error-alert'
import { ImageDropZone } from '@/components/ui/image-drop-zone'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateImage } from '@/hooks/use-generate'
import { useGenerationForm } from '@/hooks/use-generation-form'
import {
  buildSavedModelOptions,
  findSelectedModel,
  getTranslatedModelLabel,
} from '@/lib/model-options'
import { cn } from '@/lib/utils'

function getTranslatedModelDescription(
  t: (key: string, values?: Record<string, string | number>) => string,
  tModels: (key: string, values?: Record<string, string | number>) => string,
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
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    `workspace:${AI_MODELS.GEMINI_FLASH_IMAGE}`,
  )
  const {
    prompt,
    setPrompt,
    aspectRatio,
    setAspectRatio,
    referenceImage,
    isDragging,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleInputChange,
    clearImage,
    isEnhancing,
    enhanced,
    enhancedOriginal,
    enhancedStyle,
    enhancePrompt,
    clearEnhancement,
    applyEnhancedPrompt,
  } = useGenerationForm()
  const { isGenerating, error, generatedGeneration, generate } =
    useGenerateImage()
  const { keys: apiKeys, healthMap } = useApiKeysContext()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('StudioForm')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const activeApiKeys = apiKeys.filter((key) => key.isActive)

  const verifiedAdapterTypes = new Set(
    activeApiKeys
      .filter((key) => healthMap[key.id] === 'available')
      .map((key) => key.adapterType),
  )

  const builtInOptions: StudioModelOption[] = MODEL_OPTIONS.filter(
    (model) => model.freeTier || verifiedAdapterTypes.has(model.adapterType),
  ).map((model) => ({
    optionId: `workspace:${model.id}`,
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: model.providerConfig,
    requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    isBuiltIn: true,
    freeTier: model.freeTier,
    sourceType: 'workspace',
  }))
  const savedOptions = buildSavedModelOptions(
    activeApiKeys,
    (key) => healthMap[key.id] === 'available',
  )
  const modelOptions = [...builtInOptions, ...savedOptions]
  const selectedModel = findSelectedModel(modelOptions, selectedOptionId)

  const generatedModelLabel = generatedGeneration
    ? getTranslatedModelLabel(tModels, generatedGeneration.model)
    : null

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

  if (!selectedModel) return null

  const selectedModelLabel = getTranslatedModelLabel(
    tModels,
    selectedModel.modelId,
  )
  const selectedModelDescription = getTranslatedModelDescription(
    t,
    tModels,
    selectedModel,
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card/82 p-5 shadow-sm sm:p-6">
          <ModelSelector
            value={selectedModel.optionId}
            onChange={setSelectedOptionId}
            options={modelOptions}
          />
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="font-display text-base font-medium tracking-tight text-foreground">
              {selectedModelLabel}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="rounded-full border-border/70 bg-background/70 px-2.5 py-0.5 text-xs"
              >
                {getProviderLabel(selectedModel.providerConfig)}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-foreground"
              >
                {tCommon('creditCount', { count: selectedModel.requestCount })}
              </Badge>
              {!selectedModel.isBuiltIn && (
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 bg-background/70 px-2.5 py-0.5 text-xs"
                >
                  {t('customModelBadge')}
                </Badge>
              )}
            </div>
          </div>
          <p className="mt-1.5 font-serif text-sm leading-6 text-muted-foreground">
            {selectedModelDescription}
          </p>
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
              <PromptEnhancer
                prompt={prompt}
                isEnhancing={isEnhancing}
                disabled={isGenerating}
                enhanced={enhanced}
                enhancedOriginal={enhancedOriginal}
                enhancedStyle={enhancedStyle}
                onEnhance={(style) =>
                  enhancePrompt(prompt, style, selectedModel?.keyId)
                }
                onUseEnhanced={applyEnhancedPrompt}
                onDismiss={clearEnhancement}
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
              rows={5}
              maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
              disabled={isGenerating}
              className="min-h-32 resize-none rounded-2xl border-border/75 bg-background/72 px-4 py-3 font-serif"
            />
          </div>

          <div className="mt-5">
            <CollapsiblePanel
              title={t('referenceTitle')}
              description={
                referenceImage
                  ? t('referenceSelectedDescription')
                  : t('referenceIdleDescription')
              }
              badge={
                referenceImage ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {t('referenceBadge')}
                  </Badge>
                ) : undefined
              }
            >
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
                    onClick={clearImage}
                    className="absolute right-3 top-3 rounded-full border border-border/75 bg-background/92 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={t('referenceRemoveLabel')}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <ImageDropZone
                  isDragging={isDragging}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={openFilePicker}
                  uploadLabel={t('referenceUploadAction')}
                  formatsLabel={t('referenceUploadFormats')}
                />
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                aria-label={t('referenceImageLabel')}
                className="hidden"
                onChange={handleInputChange}
              />
            </CollapsiblePanel>
          </div>

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
            <AspectRatioSelector
              options={Object.keys(IMAGE_SIZES) as AspectRatio[]}
              value={aspectRatio}
              onChange={setAspectRatio}
            />
          </div>

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

      {error && (
        <ErrorAlert title={t('errorTitle')} message={error}>
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
        </ErrorAlert>
      )}

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
