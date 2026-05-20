'use client'

import { useCallback, useState } from 'react'
import { Loader2, Scissors } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getEditTaskMeta } from '@/constants/edit-tasks'
import { useImageEdit } from '@/contexts/image-edit-context'
import { useExtractedElements } from '@/hooks/use-extracted-elements'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { createExtractedElementAPI, extractElementAPI } from '@/lib/api-client'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { EditResultActions } from '../EditResultActions'
import { EditTaskHeader } from '../EditTaskHeader'
import { ExtractedElementsGrid } from '../ExtractedElementsGrid'

const TASK = 'extract-element' as const

/**
 * BiRefNet has no text input — it auto-extracts the dominant subject. The
 * picker UI grays out the prompt field when this model is selected.
 */
const PROMPTLESS_MODELS = new Set<string>(['fal-ai/birefnet/v2'])

/**
 * Short English phrases that map to clean mask outputs. Keeping the actual
 * prompt in English even when the UI is localised — the models are trained
 * on English category labels and Chinese / Japanese tokens reduce mask
 * quality dramatically.
 */
const PRESETS = [
  { key: 'clothing', prompt: 'clothing', invert: false },
  { key: 'person', prompt: 'person', invert: false },
  { key: 'hair', prompt: 'hair', invert: false },
  { key: 'accessory', prompt: 'accessories', invert: false },
  // background = invert the foreground (subject) mask
  { key: 'background', prompt: 'person', invert: true },
] as const

export function ExtractElementTaskPage() {
  const t = useTranslations('StudioImageEdit')
  const tErrors = useTranslations('Errors')
  const {
    source,
    hasSource,
    isBusy,
    runningTask,
    setRunningTask,
    setBannerError,
    setResult,
    setLayerResult,
  } = useImageEdit()
  const defaultModelId = getEditTaskMeta(TASK)?.defaultModelId ?? ''
  const [modelId, setModelId] = useState<string>(defaultModelId)
  const [prompt, setPrompt] = useState('clothing')
  const [invert, setInvert] = useState(false)
  const [activePresetKey, setActivePresetKey] = useState<string | null>(
    'clothing',
  )
  const {
    items: extractedItems,
    isLoading: isLoadingExtracted,
    prepend: prependExtracted,
    remove: removeExtracted,
  } = useExtractedElements()

  const applyPreset = useCallback((preset: (typeof PRESETS)[number]) => {
    setPrompt(preset.prompt)
    setInvert(preset.invert)
    setActivePresetKey(preset.key)
  }, [])

  const isPromptless = PROMPTLESS_MODELS.has(modelId)

  const run = useCallback(async () => {
    if (!source || isBusy) return
    const trimmed = prompt.trim()
    // BiRefNet ignores the prompt server-side; for every other model we still
    // require one. Send a sentinel so the API schema (which mandates min(1))
    // accepts the request.
    const effectivePrompt = isPromptless ? trimmed || 'subject' : trimmed
    if (!effectivePrompt) return

    setRunningTask(TASK)
    setBannerError(null)
    const response = await extractElementAPI({
      imageUrl: source.imageUrl,
      prompt: effectivePrompt,
      invert,
      sourceGenerationId: source.generationId,
      modelId,
    })

    if (!response.success || !response.data) {
      setRunningTask(null)
      toast.error(getApiErrorMessage(tErrors, response, t('extractFailed')))
      return
    }

    setResult({
      imageUrl: response.data.imageUrl,
      width: response.data.width,
      height: response.data.height,
      task: TASK,
      generation: response.data.generation,
    })
    setLayerResult(null)

    // Auto-persist to the user's materials library. The cutout is only
    // valuable as a reusable asset, so we don't make the user click twice —
    // the save failure is non-fatal (the extract result is still on screen
    // and downloadable via EditResultActions).
    const saveResponse = await createExtractedElementAPI({
      extractedImageUrl: response.data.imageUrl,
      sourceImageUrl: source.imageUrl,
      sourceGenerationId: source.generationId ?? undefined,
      prompt: effectivePrompt,
      invert,
      modelId,
    })
    setRunningTask(null)

    if (saveResponse.success && saveResponse.data) {
      prependExtracted(saveResponse.data)
      toast.success(t('extract.success'))
    } else {
      logger.warn('[extract] auto-save to materials failed', {
        error: saveResponse.error,
      })
      toast.warning(t('extract.success'), {
        description: t('extract.saveFailed'),
      })
    }
  }, [
    invert,
    isBusy,
    isPromptless,
    modelId,
    prependExtracted,
    prompt,
    setBannerError,
    setLayerResult,
    setResult,
    setRunningTask,
    source,
    t,
    tErrors,
  ])

  const isRunning = runningTask === TASK

  return (
    <>
      <section className="rounded-xl border border-border/70 bg-card p-4">
        <EditTaskHeader
          task={TASK}
          modelId={modelId}
          onModelChange={setModelId}
          disabled={isBusy}
        />

        {isPromptless ? (
          <p className="mb-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t('extract.promptlessHint')}
          </p>
        ) : (
          <>
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('extract.presetsLabel')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => {
                  const active = activePresetKey === preset.key
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      disabled={isBusy}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/70 bg-card text-foreground hover:border-border',
                        isBusy && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      {t(`extract.presets.${preset.key}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-3 space-y-2">
              <label
                htmlFor="extract-prompt"
                className="text-xs font-medium text-muted-foreground"
              >
                {t('extract.promptLabel')}
              </label>
              <Textarea
                id="extract-prompt"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value)
                  setActivePresetKey(null)
                }}
                placeholder={t('extract.promptPlaceholder')}
                className="min-h-16 resize-none"
                disabled={isBusy}
              />
              <p className="text-2xs text-muted-foreground/70">
                {t('extract.promptHint')}
              </p>
            </div>
          </>
        )}

        <div className="mb-3 flex items-center gap-2">
          <input
            id="extract-invert"
            type="checkbox"
            checked={invert}
            onChange={(event) => setInvert(event.target.checked)}
            disabled={isBusy}
            className="size-4 rounded border-border/70"
          />
          <label
            htmlFor="extract-invert"
            className="text-xs text-muted-foreground"
          >
            {t('extract.invertLabel')}
          </label>
        </div>

        <Button
          type="button"
          className="rounded-lg"
          disabled={!hasSource || isBusy || (!isPromptless && !prompt.trim())}
          onClick={() => void run()}
        >
          {isRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Scissors className="size-4" />
          )}
          {t('extract.run')}
        </Button>
      </section>
      {extractedItems.length > 0 || isLoadingExtracted ? (
        <section className="rounded-xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t('extract.materialsTitle')}
            </h2>
            <span className="text-2xs text-muted-foreground">
              {extractedItems.length}
            </span>
          </div>
          <ExtractedElementsGrid
            items={extractedItems}
            isLoading={isLoadingExtracted}
            onRemove={removeExtracted}
          />
        </section>
      ) : null}
      <EditResultActions />
    </>
  )
}
