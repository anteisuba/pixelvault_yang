'use client'

import { useCallback, useState } from 'react'
import { Loader2, Scissors } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getEditTaskMeta } from '@/constants/edit-tasks'
import { useImageEdit } from '@/contexts/image-edit-context'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { extractElementAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { EditResultActions } from '../EditResultActions'
import { EditTaskHeader } from '../EditTaskHeader'

const TASK = 'extract-element' as const

/**
 * Short English phrases that map to clean Lang-SAM mask outputs. Keeping the
 * actual prompt in English even when the UI is localised — the model is
 * trained on English category labels and Chinese / Japanese tokens reduce
 * mask quality dramatically.
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

  const applyPreset = useCallback((preset: (typeof PRESETS)[number]) => {
    setPrompt(preset.prompt)
    setInvert(preset.invert)
    setActivePresetKey(preset.key)
  }, [])

  const run = useCallback(async () => {
    if (!source || isBusy) return
    const trimmed = prompt.trim()
    if (!trimmed) return

    setRunningTask(TASK)
    setBannerError(null)
    const response = await extractElementAPI({
      imageUrl: source.imageUrl,
      prompt: trimmed,
      invert,
      sourceGenerationId: source.generationId,
      modelId,
    })
    setRunningTask(null)

    if (!response.success || !response.data) {
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
    toast.success(t('extract.success'))
  }, [
    invert,
    isBusy,
    modelId,
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
          disabled={!hasSource || isBusy || !prompt.trim()}
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
      <EditResultActions />
    </>
  )
}
