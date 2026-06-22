'use client'

import { useCallback, useState } from 'react'

import { createNodeScriptDocAPI } from '@/lib/api-client/node-script-doc'
import type {
  NodeScriptDocRequest,
  NodeScriptDocResponseData,
} from '@/types/script-doc'

interface UseNodeScriptDocValue {
  isDrafting: boolean
  error: string | null
  /**
   * Turn the conversation (+ current doc when refining) into either a
   * structured ScriptDoc or clarifying questions (discriminated by `kind`).
   * Resolves to that result on success, or null on failure (with `error` set
   * so the workspace can surface it).
   */
  draft(
    request: NodeScriptDocRequest,
  ): Promise<NodeScriptDocResponseData | null>
  clearError(): void
}

export function useNodeScriptDoc(): UseNodeScriptDocValue {
  const [isDrafting, setIsDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draft = useCallback(
    async (
      request: NodeScriptDocRequest,
    ): Promise<NodeScriptDocResponseData | null> => {
      setIsDrafting(true)
      setError(null)

      const response = await createNodeScriptDocAPI(request)
      setIsDrafting(false)

      if (!response.success) {
        setError(response.error)
        return null
      }

      return response.data
    },
    [],
  )

  const clearError = useCallback(() => setError(null), [])

  return { isDrafting, error, draft, clearError }
}
