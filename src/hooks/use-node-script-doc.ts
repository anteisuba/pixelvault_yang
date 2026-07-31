'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { getApiErrorMessage } from '@/lib/api-error-message'
import { createNodeScriptDocAPI } from '@/lib/api-client/node-script-doc'
import type {
  NodeScriptDocRequest,
  NodeScriptDocResponseData,
  ScriptDocTrimNotice,
} from '@/types/script-doc'

interface UseNodeScriptDocValue {
  isDrafting: boolean
  error: string | null
  /**
   * What the server had to leave out of the last request to stay inside the
   * prompt budget — null when nothing was trimmed. Surfaced so a long script
   * degrades visibly instead of silently.
   */
  trim: ScriptDocTrimNotice | null
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
  const tErrors = useTranslations('Errors')
  const [isDrafting, setIsDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trim, setTrim] = useState<ScriptDocTrimNotice | null>(null)

  const draft = useCallback(
    async (
      request: NodeScriptDocRequest,
    ): Promise<NodeScriptDocResponseData | null> => {
      setIsDrafting(true)
      setError(null)
      setTrim(null)

      const response = await createNodeScriptDocAPI(request)
      setIsDrafting(false)

      if (!response.success) {
        // Resolve `i18nKey` first — without this the actionable server reasons
        // (notably "the script is too long") reach the user as raw English.
        setError(
          getApiErrorMessage(tErrors, response, tErrors('common.unexpected')),
        )
        return null
      }

      setTrim(response.data.trim ?? null)
      return response.data
    },
    [tErrors],
  )

  const clearError = useCallback(() => setError(null), [])

  return { isDrafting, error, trim, draft, clearError }
}
