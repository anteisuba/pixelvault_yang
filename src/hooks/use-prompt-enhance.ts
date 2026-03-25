'use client'

import { useState, useCallback } from 'react'
import type { PromptEnhanceStyle } from '@/constants/config'
import { enhancePromptAPI } from '@/lib/api-client'

interface PromptEnhanceState {
  isEnhancing: boolean
  enhanced: string | null
  original: string | null
  style: PromptEnhanceStyle | null
  error: string | null
}

export function usePromptEnhance() {
  const [state, setState] = useState<PromptEnhanceState>({
    isEnhancing: false,
    enhanced: null,
    original: null,
    style: null,
    error: null,
  })

  const enhance = useCallback(
    async (prompt: string, style: PromptEnhanceStyle, apiKeyId?: string) => {
      setState((prev) => ({
        ...prev,
        isEnhancing: true,
        error: null,
      }))

      const result = await enhancePromptAPI({ prompt, style, apiKeyId })

      if (result.success && result.data) {
        setState({
          isEnhancing: false,
          enhanced: result.data.enhanced,
          original: result.data.original,
          style: result.data.style as PromptEnhanceStyle,
          error: null,
        })
      } else {
        setState((prev) => ({
          ...prev,
          isEnhancing: false,
          error: result.error ?? 'Enhancement failed',
        }))
      }

      return result
    },
    [],
  )

  const clearEnhancement = useCallback(() => {
    setState({
      isEnhancing: false,
      enhanced: null,
      original: null,
      style: null,
      error: null,
    })
  }, [])

  return {
    ...state,
    enhance,
    clearEnhancement,
  }
}
