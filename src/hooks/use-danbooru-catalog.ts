'use client'
import { useEffect, useState } from 'react'
import { getDanbooruCatalogAPI } from '@/lib/api-client/danbooru-catalog'
import type {
  DanbooruCatalog,
  DanbooruCatalogKind,
} from '@/types/danbooru-catalog'

/** 查资料的一次问法：搜名字 · 取一个候选的详情 · 画风页随便看看。 */
export interface DanbooruCatalogRequest {
  kind: DanbooruCatalogKind
  query?: string
  tag?: string
  random?: boolean
  /** 「换一批」：变一下就重新抽。 */
  round?: number
}

/**
 * `null` = 这会儿什么都不问。
 *
 * 打字才去抖（停手 300ms 再查）；点候选、换一批立刻查。换词重搜时 `previous` 还是
 * 上一次拿到的，调用方让旧列表原地留着，⛔ 不每打一个字就整块刷成骨架
 * （owner 2026-09-27 查资料 B 动效表）。
 */
export function useDanbooruCatalog(request: DanbooruCatalogRequest | null) {
  const key = request ? JSON.stringify(request) : null
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    key: string
    data?: DanbooruCatalog
    error?: boolean
  }>()
  const text = request?.query?.trim() ?? ''
  const active = Boolean(
    request && (request.tag || request.random || text.length >= 2),
  )
  useEffect(() => {
    if (!active || !key) return
    const asked = JSON.parse(key) as DanbooruCatalogRequest
    const controller = new AbortController()
    const timer = setTimeout(
      () => {
        void getDanbooruCatalogAPI(
          {
            kind: asked.kind,
            query: asked.query?.trim() || undefined,
            tag: asked.tag,
            random: asked.random ? '1' : undefined,
          },
          controller.signal,
        )
          .then((data) => {
            if (!controller.signal.aborted) setResult({ key, data })
          })
          .catch(() => {
            if (!controller.signal.aborted) setResult({ key, error: true })
          })
      },
      asked.tag || asked.random ? 0 : 300,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, active, retry])
  const current = active && result?.key === key ? result : undefined
  return {
    data: current?.data,
    previous: result?.data,
    error: Boolean(current?.error),
    loading: active && !current,
    retry: () => {
      setResult(undefined)
      setRetry((value) => value + 1)
    },
  }
}
