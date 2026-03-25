'use client'

import { useState, useCallback } from 'react'
import type { AspectRatio } from '@/constants/config'
import type { GenerationRecord, GenerateVariationsModel } from '@/types'
import { analyzeImageAPI, generateVariationsAPI } from '@/lib/api-client'

type ReverseStep =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'prompt-ready'
  | 'generating'
  | 'done'

interface ReverseImageState {
  step: ReverseStep
  analysisId: string | null
  sourceImageUrl: string | null
  generatedPrompt: string | null
  variations: GenerationRecord[]
  failedModels: string[]
  error: string | null
}

const INITIAL_STATE: ReverseImageState = {
  step: 'idle',
  analysisId: null,
  sourceImageUrl: null,
  generatedPrompt: null,
  variations: [],
  failedModels: [],
  error: null,
}

export function useReverseImage() {
  const [state, setState] = useState<ReverseImageState>(INITIAL_STATE)

  const analyzeImage = useCallback(async (imageData: string) => {
    setState((prev) => ({
      ...prev,
      step: 'analyzing',
      error: null,
    }))

    const result = await analyzeImageAPI({ imageData })

    if (result.success && result.data) {
      setState((prev) => ({
        ...prev,
        step: 'prompt-ready',
        analysisId: result.data!.id,
        sourceImageUrl: result.data!.sourceImageUrl,
        generatedPrompt: result.data!.generatedPrompt,
      }))
    } else {
      setState((prev) => ({
        ...prev,
        step: 'idle',
        error: result.error ?? 'Analysis failed',
      }))
    }

    return result
  }, [])

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
    analyzeImage,
    updatePrompt,
    generateVariations,
    reset,
  }
}
