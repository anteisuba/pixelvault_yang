'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getEditTaskMeta } from '@/constants/edit-tasks'
import {
  useImageEdit,
  type OutpaintPadding,
} from '@/contexts/image-edit-context'

import { StudioOutpaintEditor } from '../../StudioOutpaintEditor'
import { EditResultActions } from '../EditResultActions'
import { EditTaskHeader } from '../EditTaskHeader'

const TASK = 'outpaint' as const

export function OutpaintTaskPage() {
  const t = useTranslations('StudioImageEdit')
  const {
    source,
    hasSource,
    isBusy,
    isMaskEditing,
    outpaint,
    setResult,
    setLayerResult,
  } = useImageEdit()
  const defaultModelId = getEditTaskMeta(TASK)?.defaultModelId ?? ''
  const [modelId, setModelId] = useState<string>(defaultModelId)

  const apply = useCallback(
    async (padding: OutpaintPadding, prompt: string) => {
      if (!source || isBusy) return

      const result = await outpaint({
        imageUrl: source.imageUrl,
        padding,
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
    [isBusy, modelId, outpaint, setLayerResult, setResult, source, t],
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
          <StudioOutpaintEditor
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
