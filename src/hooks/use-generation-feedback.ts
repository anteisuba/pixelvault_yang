'use client'

import { useState, useCallback } from 'react'

import { generationFeedbackAPI } from '@/lib/api-client'
import type { GenerationFeedbackResult } from '@/types'

interface GenerationFeedbackState {
  isLoading: boolean
  result: GenerationFeedbackResult | null
  error: string | null
}

export function useGenerationFeedback() {
  const [state, setState] = useState<GenerationFeedbackState>({
    isLoading: false,
    result: null,
    error: null,
  })

  const requestFeedback = useCallback(
    async (
      imageUrl: string,
      originalPrompt: string,
      feedback: string,
      apiKeyId?: string,
    ) => {
      setState({ isLoading: true, result: null, error: null })

      const response = await generationFeedbackAPI({
        imageUrl,
        originalPrompt,
        feedback,
        apiKeyId,
      })

      if (response.success && response.data) {
        setState({
          isLoading: false,
          result: response.data,
          error: null,
        })
      } else {
        setState({
          isLoading: false,
          result: null,
          error: response.error ?? 'Generation feedback failed',
        })
      }

      return response
    },
    [],
  )

  const clearResult = useCallback(() => {
    setState({ isLoading: false, result: null, error: null })
  }, [])

  return {
    ...state,
    requestFeedback,
    clearResult,
  }
}
