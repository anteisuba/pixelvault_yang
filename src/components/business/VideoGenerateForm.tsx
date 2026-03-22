'use client'

import { useCallback, useState } from 'react'
import { AlertCircle, Film, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  API_USAGE,
  GENERATION_LIMITS,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getAvailableVideoModels } from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'

import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import VideoPlayer from '@/components/business/VideoPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateVideo } from '@/hooks/use-generate-video'
import { cn } from '@/lib/utils'

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
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

  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState<number>(
    VIDEO_GENERATION.DEFAULT_DURATION,
  )
  const [aspectRatio, setAspectRatio] = useState<string>(
    VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
  )

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedModel || !prompt.trim()) return

      await generate({
        prompt: prompt.trim(),
        modelId: selectedModel.modelId,
        aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
        duration,
        apiKeyId: selectedApiKeyId,
      })
    },
    [selectedModel, prompt, aspectRatio, duration, selectedApiKeyId, generate],
  )

  const stageLabels: Record<string, string> = {
    queued: t('stageQueued'),
    generating: t('stageGenerating'),
    uploading: t('stageUploading'),
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Model Selector */}
      <div className="rounded-3xl border border-border/75 bg-card/82 p-5 sm:p-6">
        <label
          className={cn(
            'mb-3 block text-xs font-semibold text-muted-foreground',
            !cjk && 'uppercase tracking-nav',
          )}
        >
          {t('modelLabel')}
        </label>
        <ModelSelector
          options={modelOptions}
          value={selectedModel?.optionId ?? ''}
          onChange={setSelectedOptionId}
        />
      </div>

      {/* Duration + Aspect Ratio */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-border/75 bg-card/82 p-5">
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

        <div className="rounded-3xl border border-border/75 bg-card/82 p-5">
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
          <span className="text-xs tabular-nums text-muted-foreground">
            {prompt.length}/{GENERATION_LIMITS.PROMPT_MAX_LENGTH}
          </span>
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
