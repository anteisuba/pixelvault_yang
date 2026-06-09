'use client'

import { useEffect, useReducer, useRef } from 'react'

import { MODEL_KEYWORD_LORA_QUERY_MIN_LENGTH } from '@/constants/lora'
import { searchModelKeywordPromptTagsAPI } from '@/lib/api-client/prompt-tags'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { PromptTagDefinition } from '@/types/prompt-tags'

interface UseModelKeywordLoraTagsReturn {
  tags: PromptTagDefinition[]
  isLoading: boolean
  hasFetched: boolean
  error: string | null
}

const EMPTY: UseModelKeywordLoraTagsReturn = {
  tags: [],
  isLoading: false,
  hasFetched: false,
  error: null,
}

interface CacheEntry {
  promise: Promise<PromptTagDefinition[] | null>
  result?: PromptTagDefinition[]
  error?: string
}

const cache = new Map<string, CacheEntry>()

type Action =
  | { type: 'idle' }
  | { type: 'loading'; preserveTags?: boolean }
  | { type: 'success'; tags: PromptTagDefinition[] }
  | { type: 'error'; message: string }

function reducer(
  state: UseModelKeywordLoraTagsReturn,
  action: Action,
): UseModelKeywordLoraTagsReturn {
  switch (action.type) {
    case 'idle':
      return EMPTY
    case 'loading':
      return action.preserveTags
        ? { ...state, isLoading: true, error: null }
        : { ...EMPTY, isLoading: true }
    case 'success':
      return {
        tags: action.tags,
        isLoading: false,
        hasFetched: true,
        error: null,
      }
    case 'error':
      return {
        tags: [],
        isLoading: false,
        hasFetched: true,
        error: action.message,
      }
  }
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function __resetModelKeywordLoraTagsCacheForTests(): void {
  cache.clear()
}

export function useModelKeywordLoraTags(
  query: string,
): UseModelKeywordLoraTagsReturn {
  const normalizedQuery = normalizeQuery(query)
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (normalizedQuery.length < MODEL_KEYWORD_LORA_QUERY_MIN_LENGTH) {
      dispatch({ type: 'idle' })
      return
    }

    const cached = cache.get(normalizedQuery)
    if (cached?.result) {
      dispatch({ type: 'success', tags: cached.result })
      return
    }
    if (cached?.error) {
      dispatch({ type: 'error', message: cached.error })
      return
    }

    dispatch({ type: 'loading', preserveTags: true })

    return deferEffectTask(() => {
      const existing = cache.get(normalizedQuery)
      const inflight =
        existing?.promise ??
        searchModelKeywordPromptTagsAPI({ query: normalizedQuery }).then(
          (response) => {
            const entry = cache.get(normalizedQuery)
            if (response.success && response.data) {
              if (entry) entry.result = response.data
              return response.data
            }
            if (entry) entry.error = response.error ?? 'model-keyword failed'
            return null
          },
        )

      if (!existing) {
        cache.set(normalizedQuery, { promise: inflight })
      }

      void inflight.then((result) => {
        if (requestIdRef.current !== requestId) return
        if (result) {
          dispatch({ type: 'success', tags: result })
          return
        }
        dispatch({
          type: 'error',
          message:
            cache.get(normalizedQuery)?.error ?? 'model-keyword unavailable',
        })
      })
    })
  }, [normalizedQuery])

  return state
}
