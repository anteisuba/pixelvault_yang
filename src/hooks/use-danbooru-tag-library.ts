'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getDanbooruCatalogAPI } from '@/lib/api-client/danbooru-catalog'
import type {
  DanbooruCatalogCandidate,
  DanbooruCatalogKind,
} from '@/types/danbooru-catalog'

/**
 * 标签库的网格（第 9f 步 9f-2c）：这一类按作品数从多到少，滚到底接着翻下一页。
 * 四类各记各的：切回来还是刚才翻到的那些，⛔ 换页就从头再翻。
 */
interface KindPages {
  items: DanbooruCatalogCandidate[]
  nextPage: number | null
  loading: boolean
  error: boolean
}

const EMPTY: KindPages = {
  items: [],
  nextPage: 1,
  loading: false,
  error: false,
}

export function useDanbooruTagPages(kind: DanbooruCatalogKind | null) {
  const [pages, setPages] = useState<
    Partial<Record<DanbooruCatalogKind, KindPages>>
  >({})
  const inflight = useRef(new Set<DanbooruCatalogKind>())
  const current = kind ? (pages[kind] ?? EMPTY) : EMPTY

  // 只发请求、回来才写状态（第一页由 effect 发：那时「还没碰过」本身就算在加载）。
  const fetchPage = useCallback((which: DanbooruCatalogKind, page: number) => {
    if (inflight.current.has(which)) return
    inflight.current.add(which)
    const controller = new AbortController()
    void getDanbooruCatalogAPI({ kind: which, page }, controller.signal)
      .then((data) =>
        setPages((all) => {
          const before = all[which] ?? EMPTY
          const seen = new Set(before.items.map((item) => item.name))
          return {
            ...all,
            [which]: {
              items: [
                ...before.items,
                ...data.candidates.filter((item) => !seen.has(item.name)),
              ],
              nextPage: data.nextPage,
              loading: false,
              error: false,
            },
          }
        }),
      )
      .catch(() =>
        setPages((all) => ({
          ...all,
          [which]: { ...(all[which] ?? EMPTY), loading: false, error: true },
        })),
      )
      .finally(() => inflight.current.delete(which))
  }, [])

  const load = useCallback(
    (which: DanbooruCatalogKind, page: number) => {
      if (inflight.current.has(which)) return
      setPages((all) => ({
        ...all,
        [which]: { ...(all[which] ?? EMPTY), loading: true, error: false },
      }))
      fetchPage(which, page)
    },
    [fetchPage],
  )

  // 第一次进这一类：翻第一页。
  const untouched = kind !== null && pages[kind] === undefined
  useEffect(() => {
    if (kind && untouched) fetchPage(kind, 1)
  }, [kind, untouched, fetchPage])

  const loadMore = useCallback(() => {
    if (!kind || current.loading || current.error || !current.nextPage) return
    load(kind, current.nextPage)
  }, [current.error, current.loading, current.nextPage, kind, load])

  const retry = useCallback(() => {
    if (!kind) return
    load(kind, current.nextPage ?? 1)
  }, [current.nextPage, kind, load])

  return {
    items: current.items,
    loading: current.loading || untouched,
    error: current.error,
    done: current.nextPage === null,
    loadMore,
    retry,
  }
}

/**
 * 一张卡的样图：卡滚到视野附近才问（`enabled`）。⚠ 同时最多问几张 —— 一页几十张卡一起
 * 问会被 Danbooru 限流；问过的记在这一页里，翻回来不再问。
 */
const PREVIEW_CONCURRENCY = 4

type Preview = Pick<DanbooruCatalogCandidate, 'previews' | 'work'>
const previewCache = new Map<string, Promise<Preview>>()
let running = 0
const waiting: (() => void)[] = []

function queued<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running += 1
      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1
          waiting.shift()?.()
        })
    }
    if (running < PREVIEW_CONCURRENCY) start()
    else waiting.push(start)
  })
}

function loadPreview(
  kind: DanbooruCatalogKind,
  name: string,
): Promise<Preview> {
  const key = `${kind}:${name}`
  const hit = previewCache.get(key)
  if (hit) return hit
  const request = queued(() =>
    getDanbooruCatalogAPI(
      { kind, tag: name, preview: '1' },
      new AbortController().signal,
    ),
  ).then((data) => ({
    previews: data.candidates[0]?.previews ?? [],
    work: data.candidates[0]?.work ?? null,
  }))
  // 失败的不记：下次滚到再问。
  request.catch(() => previewCache.delete(key))
  previewCache.set(key, request)
  return request
}

export function useDanbooruTagPreview(
  kind: DanbooruCatalogKind,
  name: string,
  enabled: boolean,
): Preview | null {
  const key = `${kind}:${name}`
  const [result, setResult] = useState<{ key: string; value: Preview } | null>(
    null,
  )
  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadPreview(kind, name)
      .then((value) => {
        if (alive) setResult({ key, value })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled, key, kind, name])
  return result?.key === key ? result.value : null
}
