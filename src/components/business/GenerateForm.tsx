'use client'

import { useState } from 'react'
import { AlertCircle, ImageIcon, Loader2, Sparkles } from 'lucide-react'
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
  const { isGenerating, error, generatedGeneration, generate } =
    useGenerateImage()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('StudioForm')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const selectedModel =
    MODEL_OPTIONS.find((model) => model.id === modelId) ?? MODEL_OPTIONS[0]

  const getTranslatedModelLabel = (modelValue: AI_MODELS): string =>
    tModels(`${getModelMessageKey(modelValue)}.label`)

  const getTranslatedModelDescription = (modelValue: AI_MODELS): string =>
    tModels(`${getModelMessageKey(modelValue)}.description`)

  const generatedModelLabel =
    generatedGeneration && isAiModel(generatedGeneration.model)
      ? getTranslatedModelLabel(generatedGeneration.model)
      : generatedGeneration?.model

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isGenerating || !selectedModel) return

    await generate({
      prompt: prompt.trim(),
      modelId: selectedModel.id,
      aspectRatio: DEFAULT_ASPECT_RATIO,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <ModelSelector value={modelId} onChange={setModelId} />

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
            disabled={!prompt.trim() || isGenerating}
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
