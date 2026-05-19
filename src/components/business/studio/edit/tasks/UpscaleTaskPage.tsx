'use client'

import { useCallback, useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getEditTaskMeta } from '@/constants/edit-tasks'
import { useImageEdit } from '@/contexts/image-edit-context'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { editImageAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { EditResultActions } from '../EditResultActions'
import { EditTaskHeader } from '../EditTaskHeader'

const TASK = 'upscale' as const

type TargetScale = '2x' | '4x'

const SCALE_OPTIONS: ReadonlyArray<TargetScale> = ['2x', '4x']

export function UpscaleTaskPage() {
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
  const [targetScale, setTargetScale] = useState<TargetScale>('4x')

  const run = useCallback(async () => {
    if (!source || isBusy) return

    setRunningTask(TASK)
    setBannerError(null)
    // Drop `modelId` when 2x is selected — the server routes to Clarity
    // Upscaler based on targetScale, and Aura SR doesn't accept a 2x mode.
    const response = await editImageAPI(TASK, source.imageUrl, {
      ...(targetScale === '4x' && { modelId }),
      generationId: source.generationId,
      targetScale,
    })
    setRunningTask(null)

    if (!response.success || !response.data) {
      toast.error(getApiErrorMessage(tErrors, response, t('editFailed')))
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
    toast.success(t('success.upscale'))
  }, [
    isBusy,
    modelId,
    setBannerError,
    setLayerResult,
    setResult,
    setRunningTask,
    source,
    t,
    tErrors,
    targetScale,
  ])

  const isRunning = runningTask === TASK

  return (
    <>
      <section className="rounded-xl border border-border/70 bg-card p-4">
        <EditTaskHeader
          task={TASK}
          modelId={modelId}
          onModelChange={setModelId}
          disabled={isBusy || targetScale === '2x'}
        />
        <div className="mb-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t('upscale.scaleLabel')}
          </p>
          <div
            className="inline-flex rounded-lg border border-border/70 p-0.5"
            role="group"
            aria-label={t('upscale.scaleLabel')}
          >
            {SCALE_OPTIONS.map((option) => {
              const active = targetScale === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTargetScale(option)}
                  disabled={isBusy}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                    isBusy && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {t(`upscale.scale${option}`)}
                </button>
              )
            })}
          </div>
        </div>
        <Button
          type="button"
          className="rounded-lg"
          disabled={!hasSource || isBusy}
          onClick={() => void run()}
        >
          {isRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Wand2 className="size-4" />
          )}
          {t('actions.upscale')}
        </Button>
      </section>
      <EditResultActions />
    </>
  )
}
