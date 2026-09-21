'use client'
import { useEffect, useState } from 'react'
import { getDanbooruCatalogAPI } from '@/lib/api-client/danbooru-catalog'
import type {
  DanbooruCatalog,
  DanbooruCatalogQuery,
} from '@/types/danbooru-catalog'

export function useDanbooruCatalog(query: DanbooruCatalogQuery) {
  const key = JSON.stringify(query)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    key: string
    data?: DanbooruCatalog
    error?: boolean
  }>()
  const active = query.query.trim().length >= 2
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void getDanbooruCatalogAPI(
        JSON.parse(key) as DanbooruCatalogQuery,
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted) setResult({ key, data })
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ key, error: true })
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, active, retry])
  const current = active && result?.key === key ? result : undefined
  return {
    data: current?.data,
    error: current?.error,
    loading: active && !current,
    retry: () => {
      setResult(undefined)
      setRetry((value) => value + 1)
    },
  }
}
