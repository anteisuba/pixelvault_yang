'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { GenerationPreview } from './GenerationPreview'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import { buildStudioRemixPreset } from '@/lib/studio-remix'

export const StudioRightColumn = memo(function StudioRightColumn({
  className,
}: {
  className?: string
}) {
  const { dispatch } = useStudioForm()
  const { projects, imageUpload } = useStudioData()
  const { isGenerating, lastGeneration, retry } = useStudioGen()
  const { modelOptions } = useImageModelOptions()
  const t = useTranslations('StudioV3')
  const [selectedGenerationId, setSelectedGenerationId] = useState<
    string | null
  >(null)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)

  const previewGeneration = useMemo(() => {
    const candidates = lastGeneration
      ? [
          lastGeneration,
          ...projects.history.filter((gen) => gen.id !== lastGeneration.id),
        ]
      : projects.history

    if (selectedGenerationId && selectedGenerationId !== lastGeneration?.id) {
      return (
        candidates.find(
          (generation) => generation.id === selectedGenerationId,
        ) ?? null
      )
    }

    return candidates[0] ?? null
  }, [lastGeneration, projects.history, selectedGenerationId])

  const handleUseAsRef = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
    },
    [imageUpload, dispatch],
  )

  const handleHistorySelect = useCallback((gen: GenerationRecord) => {
    setSelectedGenerationId(gen.id)
  }, [])

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

  // Auto-expand preview when a new generation completes
  const handleHistorySelectWithExpand = useCallback((gen: GenerationRecord) => {
    setSelectedGenerationId(gen.id)
    setPreviewCollapsed(false)
  }, [])

  return (
    <div className={cn('space-y-4', className)}>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isGenerating
          ? t('generating')
          : lastGeneration
            ? t('generationComplete')
            : null}
      </div>

      {/* Collapse/expand toggle */}
      {(previewGeneration || isGenerating) && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setPreviewCollapsed((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-primary/20"
          >
            {previewCollapsed ? (
              <>
                <ChevronsUpDown className="size-3" />
                {t('showPreview')}
              </>
            ) : (
              <>
                <ChevronsDownUp className="size-3" />
                {t('hidePreview')}
              </>
            )}
          </button>
        </div>
      )}

      {!previewCollapsed && (
        <GenerationPreview
          generation={previewGeneration}
          isLatestResult={previewGeneration?.id === lastGeneration?.id}
          onUseAsReference={handleUseAsRef}
          onRemix={handleRemix}
          onRetry={() => {
            void retry()
          }}
        />
      )}

      <HistoryPanel
        generations={projects.history}
        total={projects.historyTotal}
        hasMore={projects.historyHasMore}
        isLoading={projects.isLoadingHistory}
        onLoadMore={projects.loadMoreHistory}
        onSelect={handleHistorySelectWithExpand}
        selectedId={previewCollapsed ? null : previewGeneration?.id}
      />
    </div>
  )
})
