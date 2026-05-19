'use client'

import { useCallback, useState } from 'react'
import { Eraser, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getEditTaskMeta } from '@/constants/edit-tasks'
import { useImageEdit } from '@/contexts/image-edit-context'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { editImageAPI } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

import { EditResultActions } from '../EditResultActions'
import { EditTaskHeader } from '../EditTaskHeader'

const TASK = 'remove-background' as const

export function RemoveBackgroundTaskPage() {
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

  const run = useCallback(async () => {
    if (!source || isBusy) return

    setRunningTask(TASK)
    setBannerError(null)
    const response = await editImageAPI(TASK, source.imageUrl, {
      modelId,
      generationId: source.generationId,
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
    toast.success(t('success.removeBg'))
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
        <Button
          type="button"
          className="rounded-lg"
          disabled={!hasSource || isBusy}
          onClick={() => void run()}
        >
          {isRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Eraser className="size-4" />
          )}
          {t('actions.removeBg')}
        </Button>
      </section>
      <EditResultActions />
    </>
  )
}
