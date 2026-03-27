'use client'

import { useState, useCallback } from 'react'

import { promptFeedbackAPI } from '@/lib/api-client'
import type { PromptFeedbackResponseData } from '@/types'

interface PromptFeedbackState {
  isLoading: boolean
  feedback: PromptFeedbackResponseData | null
  error: string | null
}

export function usePromptFeedback() {
  const [state, setState] = useState<PromptFeedbackState>({
    isLoading: false,
    feedback: null,
    error: null,
  })

  const requestFeedback = useCallback(
    async (prompt: string, context?: string, apiKeyId?: string) => {
      setState({ isLoading: true, feedback: null, error: null })

      const result = await promptFeedbackAPI({ prompt, context, apiKeyId })

      if (result.success && result.data) {
        setState({
          isLoading: false,
          feedback: result.data,
          error: null,
        })
      } else {
        setState({
          isLoading: false,
          feedback: null,
          error: result.error ?? 'Feedback request failed',
        })
      }

      return result
    },
    [],
  )

  const clearFeedback = useCallback(() => {
    setState({ isLoading: false, feedback: null, error: null })
  }, [])

  return {
    ...state,
    requestFeedback,
    clearFeedback,
  }
}
