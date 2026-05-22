'use client'

import { useCallback, useState } from 'react'

import type {
  ScriptBreakdownRequest,
  ScriptBreakdownResponseData,
} from '@/types'
import { createScriptBreakdownAPI } from '@/lib/api-client'

interface UseScriptBreakdownReturn {
  result: ScriptBreakdownResponseData | null
  isLoading: boolean
  error: string | null
  generate: (
    input: ScriptBreakdownRequest,
  ) => Promise<ScriptBreakdownResponseData | null>
  reset: () => void
}

export function useScriptBreakdown(): UseScriptBreakdownReturn {
  const [result, setResult] = useState<ScriptBreakdownResponseData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(
    async (
      input: ScriptBreakdownRequest,
    ): Promise<ScriptBreakdownResponseData | null> => {
      setIsLoading(true)
      setError(null)
      const response = await createScriptBreakdownAPI(input)
      setIsLoading(false)

      if (response.success && response.data) {
        setResult(response.data)
        return response.data
      }

      setError(response.error ?? null)
      return null
    },
    [],
  )

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { result, isLoading, error, generate, reset }
}
