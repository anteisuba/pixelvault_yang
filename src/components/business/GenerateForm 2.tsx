'use client'

import { useState, useRef, useCallback } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { DEFAULT_ASPECT_RATIO, GENERATION_LIMITS } from '@/constants/config'
import {
  AI_MODELS,
  getModelMessageKey,
  isAiModel,
  MODEL_OPTIONS,
} from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'

import { ModelSelector } from '@/components/business/ModelSelector'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateImage } from '@/hooks/use-generate'
import { cn } from '@/lib/utils'

/**
 * Main form for generating AI images.
 *
 * Contains model selector, prompt textarea, generate button,
 * and displays the generated image or error.
 */
export function GenerateForm() {
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState<string>(AI_MODELS.SDXL)
  const [referenceImage, setReferenceImage] = useState<string | undefined>(undefined)
  const [showReferencePanel, setShowReferencePanel] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isGenerating, error, generatedGeneration, generate } =
    useGenerateImage()
  const { keys: apiKeys, isLoading: isLoadingKeys } = useApiKeysContext()
  // Set of model IDs that have an active key; undefined = still loading (don't disable)
  const activeKeyProviders = isLoadingKeys
    ? undefined
    : new Set(apiKeys.filter((k) => k.isActive).map((k) => k.provider))
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('StudioForm')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const selectedModel =
    MODEL_OPTIONS.find((model) => model.id === modelId) ?? MODEL_OPTIONS[0]

  // Keys for the currently selected model (matched by model ID)
  const keysForCurrentProvider = apiKeys.filter(
    (k) => k.provider === selectedModel.id && k.isActive,
  )
  const currentModelHasKey = keysForCurrentProvider.length > 0

  const getTranslatedModelLabel = (modelValue: AI_MODELS): string =>
    tModels(`${getModelMessageKey(modelValue)}.label`)

  const getTranslatedModelDescription = (modelValue: AI_MODELS): string =>
    tModels(`${getModelMessageKey(modelValue)}.description`)

  const generatedModelLabel =
    generatedGeneration && isAiModel(generatedGeneration.model)
      ? getTranslatedModelLabel(generatedGeneration.model)
      : generatedGeneration?.model

  const loadImageAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFileChange = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    const base64 = await loadImageAsBase64(file)
    setReferenceImage(base64)
  }, [loadImageAsBase64])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await handleFileChange(file)
  }, [handleFileChange])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isGenerating || !selectedModel) return

    await generate({
      prompt: prompt.trim(),
      modelId: selectedModel.id,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      referenceImage,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <ModelSelector value={modelId} onChange={setModelId} activeKeyProviders={activeKeyProviders} />

          {selectedModel ? (
            <div className="mt-4 rounded-xl border bg-secondary/30 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p
                    className={cn(
                      'text-xs font-semibold text-muted-foreground',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-wider',
                    )}
                  >
                    {t('selectedModelLabel')}
                  </p>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {getTranslatedModelLabel(selectedModel.id)}
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {getTranslatedModelDescription(selectedModel.id)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground">
                    {t('providerLabel')}: {selectedModel.provider}
                  </span>
                  <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground">
                    {t('creditCostLabel')}:{' '}
                    {tCommon('creditCount', { count: selectedModel.cost })}
                  </span>
                </div>
              </div>

              {/* API key status */}
              {!isLoadingKeys && (
                <div className="mt-3 border-t pt-3">
                  {currentModelHasKey ? (
                    (() => {
                      const activeKey = keysForCurrentProvider.find((k) => k.isActive)
                      return (
                        <p className="text-xs text-muted-foreground">
                          Using key: <span className="font-mono font-medium text-foreground">{activeKey?.label}</span>
                          {' '}(<span className="font-mono">{activeKey?.maskedKey}</span>)
                        </p>
                      )
                    })()
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No API key set for {selectedModel.provider}. Add one via API Keys.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
              rows={6}
              maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
              disabled={isGenerating}
              className="min-h-36 resize-none rounded-xl bg-background"
            />
          </div>
        </div>
      </div>

      {/* Reference Image (img2img) Panel */}
      <div className="rounded-2xl border bg-card">
        <button
          type="button"
          onClick={() => setShowReferencePanel((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">Reference Image</p>
            <p className="text-xs text-muted-foreground">
              {referenceImage ? 'Image selected — img2img mode active' : 'Optional: upload a reference image to guide generation'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {referenceImage && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                img2img
              </span>
            )}
            {showReferencePanel ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {showReferencePanel && (
          <div className="border-t px-4 pb-4 pt-3">
            {referenceImage ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referenceImage}
                  alt="Reference"
                  className="h-32 w-auto rounded-xl border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setReferenceImage(undefined)}
                  className="absolute -right-2 -top-2 rounded-full border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed py-6 text-center transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40',
                )}
              >
                <Upload className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground/70">PNG, JPG, WebP</p>
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
        )}
      </div>

      <div className="rounded-2xl border bg-secondary/30 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p
              className={cn(
                'text-xs font-semibold text-muted-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-wider',
              )}
            >
              {t('ctaSectionLabel')}
            </p>
            <p className="text-sm leading-6 text-foreground">
              {t('ctaSectionDescription')}
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!prompt.trim() || isGenerating || (!isLoadingKeys && !currentModelHasKey)}
            className="w-full sm:w-auto"
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
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{t('errorTitle')}</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="space-y-1">
          <p
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              isDenseLocale
                ? 'tracking-normal normal-case'
                : 'uppercase tracking-wider',
            )}
          >
            {t('resultLabel')}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('resultDescription')}
          </p>
        </div>

        {generatedGeneration ? (
          <div className="overflow-hidden rounded-2xl border bg-card animate-in fade-in-0 zoom-in-95 duration-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generatedGeneration.url}
              alt={generatedGeneration.prompt}
              className="h-auto w-full object-cover"
            />

            <div className="space-y-4 border-t p-4 sm:p-5">
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-wider',
                  )}
                >
                  {t('resultPromptLabel')}
                </p>
                <p className="text-sm leading-6 text-foreground">
                  {generatedGeneration.prompt}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border bg-secondary/50 px-3 py-1 text-xs font-medium text-foreground">
                  {t('resultModelLabel')}: {generatedModelLabel}
                </span>
                <span className="rounded-full border bg-secondary/50 px-3 py-1 text-xs font-medium text-foreground">
                  {t('resultProviderLabel')}: {generatedGeneration.provider}
                </span>
                <span className="rounded-full border bg-secondary/50 px-3 py-1 text-xs font-medium text-foreground">
                  {t('resultCreditLabel')}:{' '}
                  {tCommon('creditCount', {
                    count: generatedGeneration.creditsCost,
                  })}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">
                {t('resultStorageNote')}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-card/70 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="rounded-xl bg-secondary p-3 text-foreground">
                <ImageIcon className="size-5" />
              </span>
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-foreground">
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
