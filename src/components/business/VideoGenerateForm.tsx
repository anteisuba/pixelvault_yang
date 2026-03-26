'use client'

import { useCallback, useState } from 'react'
import { Film, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { GENERATION_LIMITS, VIDEO_GENERATION } from '@/constants/config'
import { getAvailableVideoModels, getModelById } from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'

import dynamic from 'next/dynamic'

import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'

const PromptEnhancer = dynamic(() =>
  import('@/components/business/PromptEnhancer').then(
    (mod) => mod.PromptEnhancer,
  ),
)
import VideoPlayer from '@/components/business/VideoPlayer'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { ErrorAlert } from '@/components/ui/error-alert'
import { ReferenceImageSection } from '@/components/ui/reference-image-section'
import { OptionGroup } from '@/components/ui/option-group'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateVideo } from '@/hooks/use-generate-video'
import { useGenerationForm } from '@/hooks/use-generation-form'
import { buildSavedModelOptions, findSelectedModel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

const RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const

/** Video size lookup matching OpenAI Sora's expected sizes */
const VIDEO_SIZES: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
}

/** Resize a base64 data-URL image to exact dimensions using Canvas */
function resizeImageToDataUrl(
  dataUrl: string,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => reject(new Error('Failed to load image for resize'))
    img.src = dataUrl
  })
}

export default function VideoGenerateForm() {
  const locale = useLocale()
  const cjk = isCjkLocale(locale)
  const t = useTranslations('VideoGenerate')

  const { keys } = useApiKeysContext()
  const {
    isGenerating,
    stage,
    elapsedSeconds,
    error,
    generatedGeneration,
    generate,
  } = useGenerateVideo()

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
  } = useGenerationForm({
    defaultAspectRatio: VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
  })

  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [duration, setDuration] = useState<number>(
    VIDEO_GENERATION.DEFAULT_DURATION,
  )
  const [resolution, setResolution] = useState<string | undefined>()
  const [negativePrompt, setNegativePrompt] = useState('')

  const videoModels = getAvailableVideoModels()

  const builtInOptions: StudioModelOption[] = videoModels.map((model) => ({
    optionId: `workspace:${model.id}`,
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: model.providerConfig,
    requestCount: model.cost,
    isBuiltIn: true,
    sourceType: 'workspace',
  }))
  const savedOptions = buildSavedModelOptions(
    keys.filter((key) => key.isActive),
    (key) => videoModels.some((m) => m.id === key.modelId),
  )
  const modelOptions = [...builtInOptions, ...savedOptions]
  const selectedModel = findSelectedModel(modelOptions, selectedOptionId)

  const selectedApiKeyId = selectedModel?.keyId
  const selectedModelConfig = selectedModel
    ? getModelById(selectedModel.modelId)
    : undefined

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedModel || !prompt.trim()) return

      let processedImage = referenceImage
      if (referenceImage && selectedModel.adapterType === 'openai') {
        const dims = VIDEO_SIZES[aspectRatio] ?? VIDEO_SIZES['16:9']
        processedImage = await resizeImageToDataUrl(
          referenceImage,
          dims.width,
          dims.height,
        )
      }

      await generate({
        prompt: prompt.trim(),
        modelId: selectedModel.modelId,
        aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
        duration,
        referenceImage: processedImage,
        negativePrompt: negativePrompt.trim() || undefined,
        resolution: resolution as
          | '480p'
          | '540p'
          | '720p'
          | '1080p'
          | undefined,
        apiKeyId: selectedApiKeyId,
      })
    },
    [
      selectedModel,
      prompt,
      aspectRatio,
      duration,
      referenceImage,
      negativePrompt,
      resolution,
      selectedApiKeyId,
      generate,
    ],
  )

  const stageLabels: Record<string, string> = {
    queued: t('stageQueued'),
    generating: t('stageGenerating'),
    uploading: t('stageUploading'),
  }

  const tierLabel = selectedModelConfig?.qualityTier

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Model Selector */}
      <div className="rounded-3xl border border-border/75 bg-card/82 p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <label
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('modelLabel')}
          </label>
          {tierLabel && (
            <Badge
              variant={tierLabel === 'premium' ? 'default' : 'secondary'}
              className="rounded-full px-2 py-0.5 text-3xs"
            >
              {tierLabel}
            </Badge>
          )}
        </div>
        <ModelSelector
          options={modelOptions}
          value={selectedModel?.optionId ?? ''}
          onChange={setSelectedOptionId}
        />
      </div>

      {/* Duration + Aspect Ratio + Resolution */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0 rounded-3xl border border-border/75 bg-card/82 p-5">
          <label
            className={cn(
              'mb-3 block text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('durationLabel')}
          </label>
          <OptionGroup
            options={VIDEO_GENERATION.DURATION_OPTIONS.map((d) => ({
              value: String(d),
              label: `${d}s`,
            }))}
            value={String(duration)}
            onChange={(v) => setDuration(Number(v))}
            variant="neutral"
          />
        </div>

        <div className="min-w-0 rounded-3xl border border-border/75 bg-card/82 p-5">
          <label
            className={cn(
              'mb-3 block text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('aspectRatioLabel')}
          </label>
          <OptionGroup
            options={['16:9', '9:16', '1:1']}
            value={aspectRatio}
            onChange={setAspectRatio}
            variant="neutral"
          />
        </div>

        <div className="min-w-0 rounded-3xl border border-border/75 bg-card/82 p-5">
          <label
            className={cn(
              'mb-3 block text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('resolutionLabel')}
          </label>
          <OptionGroup
            options={RESOLUTION_OPTIONS.map((r) => r)}
            value={resolution ?? ''}
            onChange={(v) => setResolution(v || undefined)}
            allowDeselect
            variant="neutral"
          />
        </div>
      </div>

      {/* Reference Image */}
      <div className="rounded-3xl border border-border/75 bg-card/82 p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <label
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('referenceImageLabel')}
          </label>
          {referenceImage && (
            <Badge variant="secondary" className="rounded-full px-2 py-0.5">
              I2V
            </Badge>
          )}
        </div>

        <ReferenceImageSection
          referenceImage={referenceImage}
          isDragging={isDragging}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onOpenFilePicker={openFilePicker}
          onInputChange={handleInputChange}
          onClear={clearImage}
          previewAlt={t('referenceImageLabel')}
          removeLabel={t('referenceRemoveLabel')}
          uploadLabel={t('referenceImageUpload')}
          formatsLabel={t('referenceImageHint')}
          inputAriaLabel={t('referenceImageLabel')}
        />
      </div>

      {/* Prompt */}
      <div className="rounded-3xl border border-border/75 bg-card/82 p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <label
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('promptLabel')}
          </label>
          <div className="flex items-center gap-2">
            <PromptEnhancer
              prompt={prompt}
              isEnhancing={isEnhancing}
              disabled={isGenerating}
              enhanced={enhanced}
              enhancedOriginal={enhancedOriginal}
              enhancedStyle={enhancedStyle}
              onEnhance={(style) =>
                enhancePrompt(prompt, style, selectedApiKeyId)
              }
              onUseEnhanced={applyEnhancedPrompt}
              onDismiss={clearEnhancement}
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {prompt.length}/{GENERATION_LIMITS.PROMPT_MAX_LENGTH}
            </span>
          </div>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('promptPlaceholder')}
          maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
          rows={4}
          className="min-h-28 rounded-3xl border-border/75 bg-background/72"
        />
      </div>

      {/* Advanced Settings */}
      <CollapsiblePanel
        title={t('advancedSettings')}
        className="rounded-3xl border border-border/75 bg-card/82 p-5 sm:p-6"
      >
        <label className="mb-2 block text-xs text-muted-foreground">
          {t('negativePromptLabel')}
        </label>
        <Textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder={t('negativePromptPlaceholder')}
          rows={2}
          className="min-h-16 rounded-2xl border-border/75 bg-background/72 text-sm"
        />
      </CollapsiblePanel>

      {/* Submit */}
      <div className="rounded-3xl border border-border/75 bg-primary/6 p-5 sm:p-6">
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:justify-between">
          <p className="font-serif text-sm text-muted-foreground">
            {t('submitHint')}
          </p>
          <Button
            type="submit"
            disabled={isGenerating || !selectedModel || !prompt.trim()}
            className="w-full rounded-full lg:w-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {stageLabels[stage] ?? t('generating')}
              </>
            ) : (
              <>
                <Film className="mr-2 size-4" />
                {t('generateButton')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Generation progress */}
      {isGenerating && stage !== 'idle' && (
        <div className="rounded-3xl border border-border/75 bg-card/82 p-6">
          <p className="mb-4 text-center font-display text-lg font-medium">
            {t('generatingTitle')}
          </p>
          <div className="mb-3 flex items-center justify-center gap-3 text-sm">
            {(['queued', 'generating', 'uploading'] as const).map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="mx-1 h-px w-4 bg-border" />}
                <span
                  className={cn(
                    'size-2 rounded-full',
                    stage === s
                      ? 'bg-primary'
                      : s < stage
                        ? 'bg-foreground'
                        : 'bg-border',
                  )}
                />
                <span
                  className={cn(
                    stage === s
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {stageLabels[s]}
                </span>
              </span>
            ))}
          </div>
          <p className="text-center font-serif text-sm text-muted-foreground">
            {t('elapsed', { seconds: formatDuration(elapsedSeconds) })}
          </p>
        </div>
      )}

      {/* Error */}
      {error && <ErrorAlert message={error} />}

      {/* Result */}
      {generatedGeneration && (
        <div className="animate-in fade-in-0 zoom-in-95 space-y-4 rounded-3xl border border-border/75 bg-card/86 p-5 duration-500 sm:p-6">
          <label
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('resultLabel')}
          </label>
          <VideoPlayer src={generatedGeneration.url} />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{generatedGeneration.model}</Badge>
            <Badge variant="secondary">
              {generatedGeneration.duration
                ? `${generatedGeneration.duration}s`
                : ''}
            </Badge>
          </div>
          <p className="line-clamp-3 font-serif text-sm text-muted-foreground">
            {generatedGeneration.prompt}
          </p>
        </div>
      )}
    </form>
  )
}
