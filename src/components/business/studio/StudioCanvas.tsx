'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'

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
 * Accepts gallery image drops — adds as reference and opens the ref panel.
 */
export const StudioCanvas = memo(function StudioCanvas() {
  const { dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { lastGeneration, retry } = useStudioGen()
  const { modelOptions } = useImageModelOptions()

  // ── Drop target: gallery images → open reference panel (Pragmatic DnD) ──
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === 'studio-generation',
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false)
        const url = source.data.url as string
        if (url) {
          void imageUpload.addFromUrl(url).then(() => {
            dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
          })
        }
      },
    })
  }, [imageUpload, dispatch])

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
      ref={canvasRef}
      className={cn(
        'studio-canvas transition-all',
        isDragOver && 'ring-2 ring-primary/40 bg-primary/5 rounded-xl',
      )}
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
