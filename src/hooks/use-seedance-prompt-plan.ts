'use client'

import { useCallback, useState } from 'react'

import {
  createSeedancePromptPlanAPI,
  type SeedancePromptPlanApiResponse,
} from '@/lib/api-client/seedance-prompt-plan'
import type { SeedancePromptPlanRequest } from '@/types/seedance-prompt-plan'

interface UseSeedancePromptPlanValue {
  generate(
    params: SeedancePromptPlanRequest,
  ): Promise<SeedancePromptPlanApiResponse>
  isLoading: boolean
  error: string | null
  errorCode: string | null
  reset(): void
}

export function useSeedancePromptPlan(): UseSeedancePromptPlanValue {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const reset = useCallback(() => {
    setError(null)
    setErrorCode(null)
  }, [])

  const generate = useCallback(
    async (
      params: SeedancePromptPlanRequest,
    ): Promise<SeedancePromptPlanApiResponse> => {
      setIsLoading(true)
      setError(null)
      setErrorCode(null)

      try {
        const response = await createSeedancePromptPlanAPI(params)
        if (!response.success) {
          setError(response.error)
          setErrorCode(response.errorCode ?? null)
        }

        return response
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : 'Seedance prompt plan request failed'
        setError(message)
        setErrorCode(null)
        return {
          success: false,
          error: message,
        }
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return {
    generate,
    isLoading,
    error,
    errorCode,
    reset,
  }
}
