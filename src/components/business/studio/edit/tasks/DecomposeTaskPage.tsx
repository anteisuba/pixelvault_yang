'use client'

import { useCallback, useState } from 'react'
import { Download, Layers, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getEditTaskMeta } from '@/constants/edit-tasks'
import { useImageEdit } from '@/contexts/image-edit-context'
import {
  getApiErrorMessage,
  getGenerationErrorMessage,
} from '@/lib/api-error-message'
import { decomposeImageAPI, downloadRemoteAsset } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

import { EditResultActions } from '../EditResultActions'
import { EditTaskHeader } from '../EditTaskHeader'

const TASK = 'decompose' as const

export function DecomposeTaskPage() {
  const t = useTranslations('StudioImageEdit')
  const tErrors = useTranslations('Errors')
  const {
    source,
    hasSource,
    isBusy,
    runningTask,
    setRunningTask,
    decomposeStage,
    setDecomposeStage,
    setBannerError,
    layerResult,
    setLayerResult,
  } = useImageEdit()
  const defaultModelId = getEditTaskMeta(TASK)?.defaultModelId ?? ''
  const [modelId, setModelId] = useState<string>(defaultModelId)

  const run = useCallback(async () => {
    if (!source || isBusy) return

    setRunningTask(TASK)
    setDecomposeStage('queued')
    setBannerError(null)
    const stageTimer = window.setTimeout(
      () => setDecomposeStage('running'),
      8000,
    )

    try {
      const response = await decomposeImageAPI(source.imageUrl, { modelId })

      if (!response.success || !response.data) {
        toast.error(
          getGenerationErrorMessage(tErrors, response, t('decomposeFailed')),
        )
        return
      }

      setLayerResult(response.data)
      toast.success(t('decomposeDone', { count: response.data.layerCount }))
    } finally {
      window.clearTimeout(stageTimer)
      setRunningTask(null)
    }
  }, [
    isBusy,
    modelId,
    setBannerError,
    setDecomposeStage,
    setLayerResult,
    setRunningTask,
    source,
    t,
    tErrors,
  ])

  const downloadPsd = useCallback(async () => {
    if (!layerResult || isBusy) return

    const response = await downloadRemoteAsset(
      layerResult.psdUrl,
      'pixelvault-layers.psd',
    )

    if (!response.success) {
      toast.error(getApiErrorMessage(tErrors, response, t('downloadFailed')))
      window.open(layerResult.psdUrl, '_blank', 'noopener,noreferrer')
    }
  }, [isBusy, layerResult, t, tErrors])

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
            <Layers className="size-4" />
          )}
          {t('actions.decompose')}
        </Button>
        {isRunning ? (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {decomposeStage === 'queued'
              ? t('decomposeQueued')
              : t('decomposeRunning')}
          </p>
        ) : null}
      </section>

      <EditResultActions />

      {layerResult ? (
        <section className="rounded-xl border border-border/70 bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t('layersTitle')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('layerCount', { count: layerResult.layerCount })}
          </p>
          {layerResult.layers.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {layerResult.layers.map((layer) => (
                <a
                  key={layer.imageUrl}
                  href={layer.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted/30"
                  title={layer.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={layer.imageUrl}
                    alt={layer.name}
                    loading="lazy"
                    className="size-full object-contain transition-transform group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                    {layer.name}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full justify-start rounded-lg"
            disabled={isBusy}
            onClick={() => void downloadPsd()}
          >
            <Download className="size-4" />
            {t('downloadPsd')}
          </Button>
        </section>
      ) : null}
    </>
  )
}
