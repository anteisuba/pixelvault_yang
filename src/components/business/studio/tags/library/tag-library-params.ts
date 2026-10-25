'use client'

import { useSearchParams } from 'next/navigation'

import { usePathname, useRouter } from '@/i18n/navigation'
import {
  DanbooruCatalogKindSchema,
  type DanbooruCatalogKind,
} from '@/types/danbooru-catalog'

/**
 * 地址里记着在看什么（刷新 / 返回都回到原处）：
 * `view=favorites` 收藏 · `kind` 哪一类 · `q` 搜索词 · `tag` 打开 / 选中的那一个（`of` = 它是
 * 哪一类，台上 Ctrl+点一格标签时不知道，就不写，按 tag 自己的类别认）。
 * 参数名与 `constants/studio-shell.ts` 拼台上那条链接的一致。
 */
export const TAG_LIBRARY_PARAM = {
  view: 'view',
  kind: 'kind',
  query: 'q',
  tag: 'tag',
  of: 'of',
} as const
export const TAG_LIBRARY_FAVORITES_VIEW = 'favorites'

export function parseTagKind(raw: string | null): DanbooruCatalogKind | null {
  const parsed = DanbooruCatalogKindSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** 读地址 + 改地址（只换给到的那几个参数，其余照留）。 */
export function useTagLibraryParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const navigate = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const text = params.toString()
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false })
  }

  return {
    favoritesView:
      searchParams.get(TAG_LIBRARY_PARAM.view) === TAG_LIBRARY_FAVORITES_VIEW,
    kind: parseTagKind(searchParams.get(TAG_LIBRARY_PARAM.kind)) ?? 'character',
    query: searchParams.get(TAG_LIBRARY_PARAM.query) ?? '',
    tag: searchParams.get(TAG_LIBRARY_PARAM.tag),
    of: parseTagKind(searchParams.get(TAG_LIBRARY_PARAM.of)),
    navigate,
    /** 库 ↔ 收藏：换格从头看（搜索词、选中的都清掉）。 */
    setView: (favorites: boolean) =>
      router.replace(
        favorites
          ? `${pathname}?${TAG_LIBRARY_PARAM.view}=${TAG_LIBRARY_FAVORITES_VIEW}`
          : pathname,
        { scroll: false },
      ),
  }
}
