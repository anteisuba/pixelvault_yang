'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Check, Film, Loader2, User } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { VIDEO_GENERATION } from '@/constants/config'
import {
  getAvailableVideoModels,
  getModelById,
  supportsLongVideo,
} from '@/constants/models'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { isCjkLocale } from '@/i18n/routing'

import dynamic from 'next/dynamic'

import type { CharacterCardRecord } from '@/types'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import { StudioApiRoutesSection } from '@/components/business/studio'

const PromptEnhancer = dynamic(() =>
  import('@/components/business/PromptEnhancer').then(
    (mod) => mod.PromptEnhancer,
  ),
)
import VideoPlayer from '@/components/business/VideoPlayer'
import { PipelineProgress } from '@/components/business/PipelineProgress'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { ErrorAlert } from '@/components/ui/error-alert'
import { ReferenceImageSection } from '@/components/ui/reference-image-section'
import { OptionGroup } from '@/components/ui/option-group'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioData } from '@/contexts/studio-context'
import { useGenerateVideo } from '@/hooks/use-generate-video'
import { useGenerateLongVideo } from '@/hooks/use-generate-long-video'
import { useGenerationForm } from '@/hooks/use-generation-form'
import {
  buildSavedModelOptions,
  findSelectedModel,
  getTranslatedModelLabel,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'
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
    const img = document.createElement('img')
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

interface VideoGenerateFormProps {
  activeCharacterCards?: CharacterCardRecord[]
}

export default function VideoGenerateForm({
  activeCharacterCards = [],
}: VideoGenerateFormProps) {
  const locale = useLocale()
  const cjk = isCjkLocale(locale)
  const t = useTranslations('VideoGenerate')
  const tCard = useTranslations('VideoGenerate.characterCard')
  const tLong = useTranslations('LongVideo')
  const tModels = useTranslations('Models')
  const tProjects = useTranslations('Projects')
  const tStudio = useTranslations('StudioV3')
  const { keys, healthMap } = useApiKeysContext()
  const { projects } = useStudioData()
  const {
    isGenerating,
    stage,
    elapsedSeconds,
    error,
    generatedGeneration,
    generate,
  } = useGenerateVideo()

  const longVideo = useGenerateLongVideo()

  const {
    prompt,
    setPrompt,
    aspectRatio,
    setAspectRatio,
    referenceImage,
    referenceImages,
    removeReferenceImage,
    clearAllImages,
    isDragging,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleInputChange,
    isEnhancing,
    enhanced,
    enhancedOriginal,
    enhancedStyle,
    enhancePrompt,
    clearEnhancement,
    applyEnhancedPrompt,
    addReferenceImage,
  } = useGenerationForm({
    defaultAspectRatio: VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
  })

  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [duration, setDuration] = useState<number>(
    VIDEO_GENERATION.DEFAULT_DURATION,
  )
  const [resolution, setResolution] = useState<string | undefined>()
  const [negativePrompt, setNegativePrompt] = useState('')
  const [selectedAppliedCardIds, setSelectedAppliedCardIds] = useState<
    string[]
  >([])
  const [longVideoMode, setLongVideoMode] = useState(false)
  const [targetDuration, setTargetDuration] = useState(30)
  const [selectedGenerationId, setSelectedGenerationId] = useState<
    string | null
  >(null)

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
  const modelOptions = mergeModelOptionsWithPreferredSavedRoutes(
    savedOptions,
    builtInOptions,
    healthMap,
  )
  const selectedModel = findSelectedModel(modelOptions, selectedOptionId)

  const selectedApiKeyId = selectedModel?.keyId
  const selectedModelConfig = selectedModel
    ? getModelById(selectedModel.modelId)
    : undefined
  const modelSupportsLongVideo = selectedModel
    ? supportsLongVideo(selectedModel.modelId)
    : false

  // Determine which generation state to use
  const isAnyGenerating = longVideoMode ? longVideo.isGenerating : isGenerating
  const currentError = longVideoMode ? longVideo.error : error
  const currentGeneration = longVideoMode
    ? longVideo.generatedGeneration
    : generatedGeneration

  const videoHistory = useMemo(
    () =>
      projects.history.filter(
        (generation) => generation.outputType === 'VIDEO',
      ),
    [projects.history],
  )
  const previewGeneration = useMemo(() => {
    if (
      selectedGenerationId &&
      selectedGenerationId !== currentGeneration?.id
    ) {
      return (
        videoHistory.find(
          (generation) => generation.id === selectedGenerationId,
        ) ?? null
      )
    }

    return currentGeneration ?? videoHistory[0] ?? null
  }, [currentGeneration, selectedGenerationId, videoHistory])
  const selectedModelLabel = selectedModel
    ? getTranslatedModelLabel(tModels, selectedModel.modelId)
    : t('modelPlaceholder')

  const hasCards = activeCharacterCards.length > 0
  const activeCardIdSet = new Set(activeCharacterCards.map((card) => card.id))
  const appliedCardIds = selectedAppliedCardIds.filter((id) =>
    activeCardIdSet.has(id),
  )
  const isCardApplied = appliedCardIds.length > 0
  const appliedCards = activeCharacterCards.filter((c) =>
    appliedCardIds.includes(c.id),
  )

  // Video only supports 1 reference image — show warning when multiple cards selected
  const maxRefImages = selectedModel
    ? getMaxReferenceImages(selectedModel.adapterType)
    : 1
  const showMultiCardWarning = hasCards && activeCharacterCards.length > 1

  function handleApplyCharacterCards() {
    if (!hasCards) return
    setPrompt('')
    clearAllImages()
    // Video supports 1 reference image — use first source image from first card
    const firstCard = activeCharacterCards[0]
    const firstImage = firstCard.sourceImages?.length
      ? firstCard.sourceImages[0]
      : firstCard.sourceImageUrl
    if (firstImage) addReferenceImage(firstImage)
    setSelectedAppliedCardIds(activeCharacterCards.map((c) => c.id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedModel || !prompt.trim()) return
    setSelectedGenerationId(null)

    let finalPrompt = prompt.trim()
    if (isCardApplied && appliedCards.length > 0) {
      const basePrompts = appliedCards
        .map((card) => card.characterPrompt.trim())
        .filter(Boolean)
      const base =
        basePrompts.length === 1
          ? basePrompts[0]
          : basePrompts
              .map(
                (promptText, index) =>
                  `[Character ${index + 1}: ${appliedCards[index].name}]\n${promptText}`,
              )
              .join('\n\n')
      const action = prompt.trim()
      finalPrompt = action ? `${base}\n\n${action}` : base
    }
    if (!finalPrompt) return

    let processedImage = referenceImage
    if (referenceImage && selectedModel.adapterType === 'openai') {
      const dims = VIDEO_SIZES[aspectRatio] ?? VIDEO_SIZES['16:9']
      processedImage = await resizeImageToDataUrl(
        referenceImage,
        dims.width,
        dims.height,
      )
    }

    const commonParams = {
      prompt: finalPrompt,
      modelId: selectedModel.modelId,
      aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
      referenceImage: processedImage,
      negativePrompt: negativePrompt.trim() || undefined,
      resolution: resolution as '480p' | '540p' | '720p' | '1080p' | undefined,
      apiKeyId: selectedApiKeyId,
      characterCardIds: appliedCardIds.length > 0 ? appliedCardIds : undefined,
    }

    if (longVideoMode) {
      await longVideo.generate({
        ...commonParams,
        targetDuration,
      })
      return
    }

    await generate({
      ...commonParams,
      duration,
    })
  }

  const stageLabels: Record<string, string> = {
    queued: t('stageQueued'),
    generating: t('stageGenerating'),
    uploading: t('stageUploading'),
  }

  const tierLabel = selectedModelConfig?.qualityTier
  const sessionDurationLabel = longVideoMode
    ? `${targetDuration}s`
    : `${duration}s`

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

      {/* Long Video Toggle */}
      {modelSupportsLongVideo && (
        <div className="flex items-center gap-3 rounded-3xl border border-border/75 bg-card/82 px-5 py-3">
          <button
            type="button"
            role="switch"
            aria-checked={longVideoMode}
            onClick={() => setLongVideoMode(!longVideoMode)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
              longVideoMode ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform',
                longVideoMode ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
          <span className="text-sm font-medium">{tLong('toggle')}</span>
          {longVideoMode && selectedModelConfig?.videoExtension && (
            <Badge
              variant="secondary"
              className="ml-auto rounded-full px-2 py-0.5 text-3xs"
            >
              {tLong('costEstimate', {
                clips: Math.ceil(
                  targetDuration /
                    (selectedModelConfig.videoExtension.extensionClipDuration ||
                      5),
                ),
                cost: selectedModelConfig.cost,
                total:
                  Math.ceil(
                    targetDuration /
                      (selectedModelConfig.videoExtension
                        .extensionClipDuration || 5),
                  ) * selectedModelConfig.cost,
              })}
            </Badge>
          )}
        </div>
      )}

      {/* Duration + Aspect Ratio + Resolution */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0 rounded-3xl border border-border/75 bg-card/82 p-5">
          <label
            className={cn(
              'mb-3 block text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {longVideoMode ? tLong('targetDuration') : t('durationLabel')}
          </label>
          {longVideoMode ? (
            <OptionGroup
              options={VIDEO_GENERATION.LONG_VIDEO_DURATION_OPTIONS.map(
                (d) => ({
                  value: String(d),
                  label: `${d}s`,
                }),
              )}
              value={String(targetDuration)}
              onChange={(v) => setTargetDuration(Number(v))}
              variant="neutral"
            />
          ) : (
            <OptionGroup
              options={VIDEO_GENERATION.DURATION_OPTIONS.map((d) => ({
                value: String(d),
                label: `${d}s`,
              }))}
              value={String(duration)}
              onChange={(v) => setDuration(Number(v))}
              variant="neutral"
            />
          )}
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
          referenceImages={referenceImages}
          maxImages={1}
          isDragging={isDragging}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onOpenFilePicker={openFilePicker}
          onInputChange={handleInputChange}
          onRemoveImage={removeReferenceImage}
          onClearAll={clearAllImages}
          previewAlt={t('referenceImageLabel')}
          removeLabel={t('referenceRemoveLabel')}
          uploadLabel={t('referenceImageUpload')}
          formatsLabel={t('referenceImageHint')}
          inputAriaLabel={t('referenceImageLabel')}
        />
      </div>

      {/* Prompt */}
      <div className="rounded-3xl border border-border/75 bg-card/82 p-5 sm:p-6">
        {/* Character card apply panel */}
        {hasCards && (
          <div
            className={cn(
              'mb-5 rounded-2xl border p-3 transition-colors',
              isCardApplied
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-primary/30 bg-primary/5',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {activeCharacterCards.slice(0, 4).map((card) => (
                  <div
                    key={card.id}
                    className="relative size-10 shrink-0 overflow-hidden rounded-lg border-2 border-background"
                  >
                    <Image
                      src={card.sourceImageUrl}
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="40px"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {activeCharacterCards.map((c) => c.name).join(' × ')}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {isCardApplied
                    ? tCard('appliedMulti', { count: appliedCards.length })
                    : tCard('hintMulti', {
                        count: activeCharacterCards.length,
                      })}
                </p>
                {showMultiCardWarning && maxRefImages < 2 && (
                  <p className="mt-0.5 text-xs text-amber-600">
                    {tCard('imageWarning')}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={isGenerating || isCardApplied}
                onClick={handleApplyCharacterCards}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  isCardApplied
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
                )}
              >
                {isCardApplied ? (
                  <>
                    <Check className="size-3" />
                    {tCard('appliedButton')}
                  </>
                ) : (
                  <>
                    <User className="size-3" />
                    {tCard('applyButton')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <label
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {isCardApplied ? tCard('actionPromptLabel') : t('promptLabel')}
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
              {prompt.length}
            </span>
          </div>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            isCardApplied
              ? tCard('actionPromptPlaceholder')
              : t('promptPlaceholder')
          }
          rows={4}
          className="min-h-28 rounded-3xl border-border/75 bg-background/72"
        />
        {isCardApplied && (
          <p className="mt-2 font-serif text-xs text-muted-foreground">
            {tCard('actionPromptHint')}
          </p>
        )}
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
            disabled={isAnyGenerating || !selectedModel || !prompt.trim()}
            className="w-full rounded-full lg:w-auto"
          >
            {isAnyGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {longVideoMode
                  ? tLong('clipGenerating', {
                      index: longVideo.currentClipIndex + 1,
                    })
                  : (stageLabels[stage] ?? t('generating'))}
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

      {/* Long Video Pipeline Progress */}
      {longVideoMode && longVideo.isGenerating && longVideo.pipelineStatus && (
        <div className="rounded-3xl border border-border/75 bg-card/82 p-6">
          <p className="mb-4 text-center font-display text-lg font-medium">
            {tLong('clipGenerating', { index: longVideo.currentClipIndex + 1 })}
          </p>
          <PipelineProgress
            status={longVideo.pipelineStatus}
            onRetryClip={longVideo.retryClip}
            onCancel={longVideo.cancel}
          />
          <p className="mt-3 text-center font-serif text-sm text-muted-foreground">
            {t('elapsed', {
              seconds: formatDuration(longVideo.elapsedSeconds),
            })}
          </p>
        </div>
      )}

      {/* Normal video generation progress */}
      {!longVideoMode && isGenerating && stage !== 'idle' && (
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
      {currentError && <ErrorAlert message={currentError} />}

      {/* Result */}
      {currentGeneration && (
        <div className="animate-in fade-in-0 zoom-in-95 space-y-4 rounded-3xl border border-border/75 bg-card/86 p-5 duration-500 sm:p-6">
          <label
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              !cjk && 'uppercase tracking-nav',
            )}
          >
            {t('resultLabel')}
          </label>
          <VideoPlayer src={currentGeneration.url} />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{currentGeneration.model}</Badge>
            <Badge variant="secondary">
              {currentGeneration.duration
                ? `${currentGeneration.duration}s`
                : ''}
            </Badge>
          </div>
          <p className="line-clamp-3 font-serif text-sm text-muted-foreground">
            {currentGeneration.prompt}
          </p>
        </div>
      )}
    </form>
  )
}
