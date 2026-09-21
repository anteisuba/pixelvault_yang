'use client'

import { useEffect, useState } from 'react'
import { getNovelAiTagSuggestionsAPI } from '@/lib/api-client/novelai-tags'
import type { NovelAiTagModel, NovelAiTagResponse } from '@/types/novelai-tags'

type Result = { key: string; tags: NovelAiTagResponse['tags']; error?: string }

export function useNovelAiTagSuggestions(
  model: NovelAiTagModel | undefined,
  prompt: string,
  enabled: boolean,
) {
  const query = prompt.trim()
  const key =
    model && enabled && query.length >= 2 && query.length <= 200
      ? `${model}:${query}`
      : ''
  const [result, setResult] = useState<Result>({ key: '', tags: [] })
  useEffect(() => {
    if (!key || !model) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void getNovelAiTagSuggestionsAPI(
        { model, prompt: query, lang: 'en' },
        controller.signal,
      )
        .then(({ tags }) => {
          if (!controller.signal.aborted) setResult({ key, tags })
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              tags: [],
              error: error instanceof Error ? error.message : 'UPSTREAM_ERROR',
            })
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, model, query])
  const current = key && result.key === key ? result : undefined
  return {
    tags: current?.tags ?? [],
    loading: Boolean(key && !current),
    error: current?.error,
    active: Boolean(key),
  }
}
