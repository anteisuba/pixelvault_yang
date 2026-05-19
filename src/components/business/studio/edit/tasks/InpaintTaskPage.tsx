'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getEditTaskMeta } from '@/constants/edit-tasks'
import { useImageEdit } from '@/contexts/image-edit-context'

import { StudioInpaintEditor } from '../../StudioInpaintEditor'
import { EditResultActions } from '../EditResultActions'
import { EditTaskHeader } from '../EditTaskHeader'

const TASK = 'inpaint' as const

export function InpaintTaskPage() {
  const t = useTranslations('StudioImageEdit')
  const {
    source,
    hasSource,
    isBusy,
    isMaskEditing,
    inpaint,
    setResult,
    setLayerResult,
  } = useImageEdit()
  const defaultModelId = getEditTaskMeta(TASK)?.defaultModelId ?? ''
  const [modelId, setModelId] = useState<string>(defaultModelId)

  const apply = useCallback(
    async (maskDataUrl: string, prompt: string) => {
      if (!source || isBusy) return

      const result = await inpaint({
        imageUrl: source.imageUrl,
        maskImageUrl: maskDataUrl,
        prompt,
        sourceGenerationId: source.generationId,
        modelId,
      })

      if (!result) return

      setResult({
        imageUrl: result.imageUrl,
        width: result.width,
        height: result.height,
        task: TASK,
        generation: result.generation,
      })
      setLayerResult(null)
      toast.success(t('savedToGallery'))
    },
    [inpaint, isBusy, modelId, setLayerResult, setResult, source, t],
  )

  return (
    <>
      <section className="rounded-xl border border-border/70 bg-card p-4">
        <EditTaskHeader
          task={TASK}
          modelId={modelId}
          onModelChange={setModelId}
          disabled={isBusy}
        />
        {hasSource && source ? (
          <StudioInpaintEditor
            imageUrl={source.imageUrl}
            imageWidth={source.width}
            imageHeight={source.height}
            onApply={apply}
            onCancel={() => undefined}
            isLoading={isMaskEditing}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('taskGrid.subtitleLoadFirst')}
          </p>
        )}
      </section>
      <EditResultActions />
    </>
  )
}
