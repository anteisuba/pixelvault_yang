'use client'

import { useCallback, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Film,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  API_USAGE,
  GENERATION_LIMITS,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getAvailableVideoModels, getModelById } from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'

import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import { PromptComparisonPanel } from '@/components/business/PromptComparisonPanel'
import { PromptEnhanceButton } from '@/components/business/PromptEnhanceButton'
import VideoPlayer from '@/components/business/VideoPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateVideo } from '@/hooks/use-generate-video'
import { usePromptEnhance } from '@/hooks/use-prompt-enhance'
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

function loadImageAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
  const tModels = useTranslations('Models')

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
    isEnhancing,
    enhanced,
    original: enhancedOriginal,
    style: enhancedStyle,
    enhance: enhancePrompt,
    clearEnhancement,
  } = usePromptEnhance()

  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState<number>(
    VIDEO_GENERATION.DEFAULT_DURATION,
  )
  const [aspectRatio, setAspectRatio] = useState<string>(
    VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
  )
  const [referenceImage, setReferenceImage] = useState<string | undefined>()
  const [resolution, setResolution] = useState<string | undefined>()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
  const savedOptions: StudioModelOption[] = keys
    .filter(
      (key) => key.isActive && videoModels.some((m) => m.id === key.modelId),
    )
    .map((key) => ({
      optionId: `key:${key.id}`,
      modelId: key.modelId,
      adapterType: key.adapterType,
      providerConfig: key.providerConfig,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      isBuiltIn: false,
      sourceType: 'saved',
      keyId: key.id,
      keyLabel: key.label,
      maskedKey: key.maskedKey,
    }))
  const modelOptions = [...builtInOptions, ...savedOptions]
  const selectedModel =
    modelOptions.find((o) => o.optionId === selectedOptionId) ?? modelOptions[0]

  const selectedApiKeyId = selectedModel?.keyId
  const selectedModelConfig = selectedModel
    ? getModelById(selectedModel.modelId)
    : undefined

  const handleFileChange = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    const base64 = await loadImageAsBase64(file)
    setReferenceImage(base64)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) await handleFileChange(file)
    },
    [handleFileChange],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedModel || !prompt.trim()) return

      // For OpenAI Sora: resize reference image to match video dimensions
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
              className="rounded-full px-2 py-0.5 text-[10px]"
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
          <div className="flex gap-2">
            {VIDEO_GENERATION.DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  duration === d
                    ? 'bg-foreground text-background'
                    : 'border border-border/75 bg-background/50 text-foreground hover:bg-muted/30',
                )}
              >
                {d}s
              </button>
            ))}
          </div>
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
          <div className="flex flex-wrap gap-2">
            {(['16:9', '9:16', '1:1'] as const).map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => setAspectRatio(ar)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  aspectRatio === ar
                    ? 'bg-foreground text-background'
                    : 'border border-border/75 bg-background/50 text-foreground hover:bg-muted/30',
                )}
              >
                {ar}
              </button>
            ))}
          </div>
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
          <div className="flex flex-wrap gap-2">
            {RESOLUTION_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResolution(resolution === r ? undefined : r)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  resolution === r
                    ? 'bg-foreground text-background'
                    : 'border border-border/75 bg-background/50 text-foreground hover:bg-muted/30',
                )}
              >
                {r}
              </button>
            ))}
          </div>
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

        {referenceImage ? (
          <div className="relative inline-flex overflow-hidden rounded-2xl border border-border/75 bg-background">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={referenceImage}
              alt={t('referenceImageLabel')}
              className="h-36 w-auto object-cover"
            />
            <button
              type="button"
              onClick={() => setReferenceImage(undefined)}
              className="absolute right-3 top-3 rounded-full border border-border/75 bg-background/92 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
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
              'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
              isDragging
                ? 'border-primary/60 bg-primary/5'
                : 'border-border/80 bg-background/72 hover:border-primary/40 hover:bg-secondary/18',
            )}
          >
            <Upload className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {t('referenceImageUpload')}
            </p>
            <p className="font-serif text-xs text-muted-foreground">
              {t('referenceImageHint')}
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
            <PromptEnhanceButton
              prompt={prompt}
              isEnhancing={isEnhancing}
              disabled={isGenerating}
              onEnhance={(style) =>
                enhancePrompt(prompt, style, selectedApiKeyId)
              }
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

        {enhanced && (
          <div className="mt-3">
            <PromptComparisonPanel
              original={enhancedOriginal ?? ''}
              enhanced={enhanced}
              style={enhancedStyle ?? ''}
              onUseEnhanced={(text) => {
                setPrompt(text)
                clearEnhancement()
              }}
              onDismiss={clearEnhancement}
            />
          </div>
        )}
      </div>

      {/* Advanced Settings */}
      <div className="rounded-3xl border border-border/75 bg-card/82 p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between"
        >
          <span
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('advancedSettings')}
          </span>
          {showAdvanced ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {showAdvanced && (
          <div className="mt-4 border-t border-border/70 pt-4">
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
          </div>
        )}
      </div>

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
      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-destructive/35 bg-destructive/8 p-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="font-serif text-sm text-destructive">{error}</p>
        </div>
      )}

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
