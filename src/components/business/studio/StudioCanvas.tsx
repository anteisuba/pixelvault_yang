'use client'

import { memo, useCallback } from 'react'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { buildStudioRemixPreset } from '@/lib/studio-remix'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import type { GenerationRecord } from '@/types'

import { GenerationPreview } from './GenerationPreview'

/**
 * StudioCanvas — central hero area for the canvas-centric layout.
 * Fills all vertical space between TopBar and BottomDock.
 * Delegates rendering to GenerationPreview (empty / loading / image / error).
 * Accepts gallery image drops — adds as reference and opens the ref panel.
 */
export const StudioCanvas = memo(function StudioCanvas() {
  const { dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { lastGeneration, retry } = useStudioGen()
  const { modelOptions } = useImageModelOptions()

  // ── Drop handler: gallery images → open reference panel ────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-studio-ref')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      const studioRef = e.dataTransfer.getData('application/x-studio-ref')
      if (!studioRef) return
      try {
        const { url } = JSON.parse(studioRef) as { url: string }
        if (url) {
          await imageUpload.addFromUrl(url)
          dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
        }
      } catch {
        // Ignore invalid data
      }
    },
    [imageUpload, dispatch],
  )

  const handleUseAsReference = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
    },
    [imageUpload, dispatch],
  )

  const handleRemix = useCallback(
    (generation: GenerationRecord) => {
      const preset = buildStudioRemixPreset(generation, modelOptions)
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
    <div
      className="studio-canvas"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="mx-auto w-full max-w-5xl">
        <GenerationPreview
          generation={lastGeneration}
          isLatestResult
          onUseAsReference={handleUseAsReference}
          onRemix={handleRemix}
          onRetry={retry}
        />
      </div>
    </div>
  )
})
