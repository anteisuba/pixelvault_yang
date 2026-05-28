'use client'

import { useState, useCallback } from 'react'
import type { AspectRatio } from '@/constants/config'
import type {
  AnalysisDimension,
  GenerationRecord,
  GenerateVariationsModel,
} from '@/types'
import { analyzeImageAPI, generateVariationsAPI } from '@/lib/api-client'

type ReverseStep =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'select-dimensions'
  | 'prompt-ready'
  | 'generating'
  | 'done'

interface ReverseImageState {
  step: ReverseStep
  analysisId: string | null
  sourceImageUrl: string | null
  generatedPrompt: string | null
  /** Per-dimension extraction results */
  dimensions: Partial<Record<AnalysisDimension, string>> | null
  /** Base64 image data held between upload and extraction */
  pendingImageData: string | null
  variations: GenerationRecord[]
  failedModels: string[]
  error: string | null
}

const INITIAL_STATE: ReverseImageState = {
  step: 'idle',
  analysisId: null,
  sourceImageUrl: null,
  generatedPrompt: null,
  dimensions: null,
  pendingImageData: null,
  variations: [],
  failedModels: [],
  error: null,
}

export function useReverseImage() {
  const [state, setState] = useState<ReverseImageState>(INITIAL_STATE)

  /** Step 1: Upload image → transition to dimension selection */
  const uploadImage = useCallback((imageData: string) => {
    setState((prev) => ({
      ...prev,
      step: 'select-dimensions',
      pendingImageData: imageData,
      error: null,
    }))
  }, [])

  /** Step 2: Extract selected dimensions from the uploaded image */
  const extractDimensions = useCallback(
    async (selectedDimensions: AnalysisDimension[], apiKeyId?: string) => {
      if (!state.pendingImageData) return

      setState((prev) => ({
        ...prev,
        step: 'analyzing',
        error: null,
      }))

      const result = await analyzeImageAPI({
        imageData: state.pendingImageData,
        dimensions: selectedDimensions,
        apiKeyId,
      })

      if (result.success && result.data) {
        setState((prev) => ({
          ...prev,
          step: 'prompt-ready',
          analysisId: result.data!.id,
          sourceImageUrl: result.data!.sourceImageUrl,
          generatedPrompt: result.data!.generatedPrompt,
          dimensions: result.data!.dimensions ?? null,
          pendingImageData: null,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          step: 'select-dimensions',
          error: result.error ?? 'Analysis failed',
        }))
      }

      return result
    },
    [state.pendingImageData],
  )

  /** Legacy: analyze without dimension selection (backward compat) */
  const analyzeImage = useCallback(
    async (imageData: string, apiKeyId?: string) => {
      setState((prev) => ({
        ...prev,
        step: 'analyzing',
        error: null,
      }))

      const result = await analyzeImageAPI({ imageData, apiKeyId })

      if (result.success && result.data) {
        setState((prev) => ({
          ...prev,
          step: 'prompt-ready',
          analysisId: result.data!.id,
          sourceImageUrl: result.data!.sourceImageUrl,
          generatedPrompt: result.data!.generatedPrompt,
          dimensions: result.data!.dimensions ?? null,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          step: 'idle',
          error: result.error ?? 'Analysis failed',
        }))
      }

      return result
    },
    [],
  )

  const updatePrompt = useCallback((prompt: string) => {
    setState((prev) => ({
      ...prev,
      generatedPrompt: prompt,
    }))
  }, [])

  const generateVariations = useCallback(
    async (models: GenerateVariationsModel[], aspectRatio: AspectRatio) => {
      if (!state.analysisId) return

      setState((prev) => ({
        ...prev,
        step: 'generating',
        error: null,
      }))

      const result = await generateVariationsAPI(state.analysisId, {
        models,
        aspectRatio,
      })

      if (result.success && result.data) {
        setState((prev) => ({
          ...prev,
          step: 'done',
          variations: result.data!.variations,
          failedModels: result.data!.failed,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          step: 'prompt-ready',
          error: result.error ?? 'Generation failed',
        }))
      }

      return result
    },
    [state.analysisId],
  )

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    ...state,
    uploadImage,
    extractDimensions,
    analyzeImage,
    updatePrompt,
    generateVariations,
    reset,
  }
}
