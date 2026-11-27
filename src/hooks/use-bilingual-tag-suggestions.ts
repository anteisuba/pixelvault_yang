'use client'

import { useEffect, useState } from 'react'
import { getDanbooruTagSuggestionsAPI } from '@/lib/api-client/tag-assist'
import { isValidTagAutocompleteQuery } from '@/lib/tag-recognition'
import type { NovelAiTagSuggestion } from '@/types/novelai-tags'

type Result = { key: string; tags: NovelAiTagSuggestion[]; error?: string }

/**
 * 非 NAI 模型下的双语 / 语义标签联想：用户输入中文、日文或本地词表未命中的短语时，
 * 防抖 250ms 调 `/api/danbooru/tag-suggestions` 取回带译名与热度的英文标签候选。
 */
export function useBilingualTagSuggestions(prompt: string, enabled: boolean) {
  const query = prompt.trim()
  const key = enabled && isValidTagAutocompleteQuery(query) ? query : ''
  const [result, setResult] = useState<Result>({ key: '', tags: [] })

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void getDanbooruTagSuggestionsAPI(key, controller.signal)
        .then(({ tags }) => {
          if (!controller.signal.aborted) setResult({ key, tags })
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              tags: [],
              error: error instanceof Error ? error.message : 'UPSTREAM_ERROR',
            })
          }
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key])

  const current = key && result.key === key ? result : undefined
  return {
    tags: current?.tags ?? [],
    loading: Boolean(key && !current),
    error: current?.error,
    active: Boolean(key),
  }
}
