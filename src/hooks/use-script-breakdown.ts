'use client'

import { useCallback, useState } from 'react'

import {
  createScriptBreakdownAPI,
  type ScriptBreakdownApiResponse,
} from '@/lib/api-client/script-breakdown'
import type { ScriptBreakdownRequest } from '@/types/script-breakdown'

interface UseScriptBreakdownValue {
  generate(params: ScriptBreakdownRequest): Promise<ScriptBreakdownApiResponse>
  isLoading: boolean
  error: string | null
  errorCode: string | null
  reset(): void
}

export function useScriptBreakdown(): UseScriptBreakdownValue {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const reset = useCallback(() => {
    setError(null)
    setErrorCode(null)
  }, [])

  const generate = useCallback(
    async (
      params: ScriptBreakdownRequest,
    ): Promise<ScriptBreakdownApiResponse> => {
      setIsLoading(true)
      setError(null)
      setErrorCode(null)

      try {
        const response = await createScriptBreakdownAPI(params)
        if (!response.success) {
          setError(response.error)
          setErrorCode(response.errorCode ?? null)
        }

        return response
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : 'Script breakdown request failed'
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
