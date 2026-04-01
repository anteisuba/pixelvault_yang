'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { GenerationPreview } from './GenerationPreview'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { buildStudioRemixPreset } from '@/lib/studio-remix'

export const StudioRightPanel = memo(function StudioRightPanel({
  className,
}: {
  className?: string
}) {
  const { dispatch } = useStudioForm()
  const { projects, imageUpload } = useStudioData()
  const { isGenerating, lastGeneration, retry } = useStudioGen()
  const { modelOptions } = useImageModelOptions()
  const t = useTranslations('StudioV3')
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(
    null,
  )

  const previewGeneration = useMemo(() => {
    const candidates = lastGeneration
      ? [lastGeneration, ...projects.history.filter((gen) => gen.id !== lastGeneration.id)]
      : projects.history

    if (selectedGenerationId && selectedGenerationId !== lastGeneration?.id) {
      return (
        candidates.find((generation) => generation.id === selectedGenerationId) ??
        null
      )
    }

    return candidates[0] ?? null
  }, [lastGeneration, projects.history, selectedGenerationId])

  // Shared handler: add an image URL as a reference image + auto-open panel
  const handleUseAsRef = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
    },
    [imageUpload, dispatch],
  )

  const handleHistorySelect = useCallback(
    (gen: GenerationRecord) => {
      setSelectedGenerationId(gen.id)
    },
    [],
  )

  const handleRemix = useCallback(
    (generation: GenerationRecord) => {
      const preset = buildStudioRemixPreset(generation, modelOptions)

      setSelectedGenerationId(null)
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'image' })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
      dispatch({ type: 'SET_PROMPT', payload: preset.prompt })
      dispatch({ type: 'SET_ASPECT_RATIO', payload: preset.aspectRatio })
      dispatch({ type: 'CLOSE_ALL_PANELS' })

      if (preset.optionId) {
        dispatch({ type: 'SET_OPTION_ID', payload: preset.optionId })
      }

      const promptField = document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)
      if (promptField instanceof HTMLTextAreaElement) {
        promptField.focus()
      }
    },
    [dispatch, modelOptions],
  )

  return (
    <div className={cn('space-y-4', className)}>
      {/* Generation status (aria-live for screen readers) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isGenerating
          ? t('generating')
          : lastGeneration
            ? t('generationComplete')
            : null}
      </div>

      {/* Hero preview — draggable + "use as reference" button */}
      <GenerationPreview
        generation={previewGeneration}
        isLatestResult={previewGeneration?.id === lastGeneration?.id}
        onUseAsReference={handleUseAsRef}
        onRemix={handleRemix}
        onRetry={() => {
          void retry()
        }}
      />

      {/* History grid — draggable + click-to-preview */}
      <HistoryPanel
        generations={projects.history}
        total={projects.historyTotal}
        hasMore={projects.historyHasMore}
        isLoading={projects.isLoadingHistory}
        onLoadMore={projects.loadMoreHistory}
        onSelect={handleHistorySelect}
        selectedId={previewGeneration?.id}
      />
    </div>
  )
})
