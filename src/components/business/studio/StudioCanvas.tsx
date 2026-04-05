'use client'

import { memo, useState, useCallback } from 'react'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { buildStudioRemixPreset } from '@/lib/studio-remix'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

import { GenerationPreview } from './GenerationPreview'

/**
 * StudioCanvas — central hero area for the canvas-centric layout.
 * Fills all vertical space between TopBar and BottomDock.
 * Delegates rendering to GenerationPreview (empty / loading / image / error).
 * Accepts dragged gallery images as reference images.
 */
export const StudioCanvas = memo(function StudioCanvas() {
  const { dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { lastGeneration, retry } = useStudioGen()
  const { modelOptions } = useImageModelOptions()

  // ── Drag-drop zone: accept gallery images as reference ──────────
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-studio-ref')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (
      e.currentTarget === e.target ||
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
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

  // ── Actions for GenerationPreview ───────────────────────────────
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
      className={cn(
        'studio-canvas flex items-center justify-center overflow-auto p-6 min-h-0 transition-colors',
        isDragOver && 'ring-2 ring-primary/40 ring-inset rounded-xl bg-primary/5',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-2xl">
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
