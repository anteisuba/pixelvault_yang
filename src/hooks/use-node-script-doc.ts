'use client'

import { useCallback, useState } from 'react'

import { createNodeScriptDocAPI } from '@/lib/api-client/node-script-doc'
import type { NodeScriptDocRequest, ScriptDoc } from '@/types/script-doc'

interface UseNodeScriptDocValue {
  isDrafting: boolean
  error: string | null
  /**
   * Turn the conversation (+ current doc when refining) into a structured
   * ScriptDoc. Resolves to the doc on success, or null on failure (with
   * `error` set so the workspace can surface it).
   */
  draft(request: NodeScriptDocRequest): Promise<ScriptDoc | null>
  clearError(): void
}

export function useNodeScriptDoc(): UseNodeScriptDocValue {
  const [isDrafting, setIsDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draft = useCallback(
    async (request: NodeScriptDocRequest): Promise<ScriptDoc | null> => {
      setIsDrafting(true)
      setError(null)

      const response = await createNodeScriptDocAPI(request)
      setIsDrafting(false)

      if (!response.success) {
        setError(response.error)
        return null
      }

      return response.data.scriptDoc
    },
    [],
  )

  const clearError = useCallback(() => setError(null), [])

  return { isDrafting, error, draft, clearError }
}
