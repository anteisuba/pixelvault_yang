'use client'
import { useEffect, useRef, useState } from 'react'
import {
  addDanbooruFavoriteAPI,
  listDanbooruFavoritesAPI,
  removeDanbooruFavoriteAPI,
} from '@/lib/api-client/danbooru-favorites'
import type {
  CreateDanbooruFavorite,
  DanbooruCatalogKind,
  DanbooruFavorite,
} from '@/types/danbooru-catalog'

const keyOf = (kind: DanbooruCatalogKind, name: string) => `${kind}:${name}`

/**
 * 查资料的收藏（owner 2026-09-28）：面板打开读一次，点星当场亮 / 灭，
 * 请求失败就退回去。⚠ 同一条在请求路上时再点不算（⛔ 连点把增删打乱）。
 */
export function useDanbooruFavorites() {
  const [favorites, setFavorites] = useState<DanbooruFavorite[]>([])
  const pending = useRef(new Set<string>())

  useEffect(() => {
    let alive = true
    listDanbooruFavoritesAPI()
      .then((rows) => {
        if (alive) setFavorites(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const find = (kind: DanbooruCatalogKind, name: string) =>
    favorites.find((item) => item.kind === kind && item.name === name)

  const toggle = (input: CreateDanbooruFavorite) => {
    const key = keyOf(input.kind, input.name)
    if (pending.current.has(key)) return
    pending.current.add(key)
    const done = () => pending.current.delete(key)
    const existing = find(input.kind, input.name)
    if (existing) {
      setFavorites((rows) => rows.filter((row) => row.id !== existing.id))
      removeDanbooruFavoriteAPI(existing.id)
        .catch(() =>
          setFavorites((rows) =>
            [existing, ...rows].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          ),
        )
        .finally(done)
      return
    }
    const draft: DanbooruFavorite = {
      ...input,
      id: `pending:${key}`,
      createdAt: new Date().toISOString(),
    }
    setFavorites((rows) => [draft, ...rows])
    addDanbooruFavoriteAPI(input)
      .then((saved) =>
        setFavorites((rows) =>
          rows.map((row) => (row.id === draft.id ? saved : row)),
        ),
      )
      .catch(() =>
        setFavorites((rows) => rows.filter((row) => row.id !== draft.id)),
      )
      .finally(done)
  }

  return {
    of: (kind: DanbooruCatalogKind) =>
      favorites.filter((item) => item.kind === kind),
    has: (kind: DanbooruCatalogKind, name: string) => Boolean(find(kind, name)),
    toggle,
  }
}
