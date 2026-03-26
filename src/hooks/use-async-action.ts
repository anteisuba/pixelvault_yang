'use client'

import { useState, useCallback } from 'react'

interface UseAsyncActionOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (message: string) => void
}

interface UseAsyncActionReturn<TParams extends unknown[], TResult> {
  execute: (...args: TParams) => Promise<TResult | undefined>
  isLoading: boolean
  error: string | null
  data: TResult | null
  reset: () => void
}

/**
 * Generic hook for managing async action state (loading, error, data).
 * Wraps any async function with standardized state management.
 */
export function useAsyncAction<TParams extends unknown[], TResult>(
  action: (...args: TParams) => Promise<TResult>,
  options?: UseAsyncActionOptions<TResult>,
): UseAsyncActionReturn<TParams, TResult> {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TResult | null>(null)

  const execute = useCallback(
    async (...args: TParams): Promise<TResult | undefined> => {
      setIsLoading(true)
      setError(null)
      setData(null)

      try {
        const result = await action(...args)
        setData(result)
        options?.onSuccess?.(result)
        return result
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred'
        setError(message)
        options?.onError?.(message)
        return undefined
      } finally {
        setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  )

  const reset = useCallback(() => {
    setError(null)
    setData(null)
  }, [])

  return { execute, isLoading, error, data, reset }
}
