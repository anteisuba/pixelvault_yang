'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_LIBRARY_FAMILY_PARAM,
  LORA_LIBRARY_NSFW_PARAM,
  LORA_LIBRARY_SEARCH_PARAM,
  LORA_LIBRARY_SORT_PARAM,
  LORA_LIBRARY_TYPE_PARAM,
  civitaiBaseModelToFamilySlug,
  familySlugToCivitaiBaseModel,
  isCivitaiLoraSort,
  isLoraNsfwFilter,
  parseLoraLibraryFamilyParam,
  parseLoraLibraryTypeParam,
} from '@/constants/lora'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  useCivitaiLoraLibrary,
  type UseCivitaiLoraLibraryOptions,
  type UseCivitaiLoraLibraryReturn,
} from '@/hooks/use-civitai-lora-library'

/**
 * Civitai 库 + 网址：首帧按网址里的 family / q / sort / nsfw / type 起步（贴过来的
 * 深链第一眼就对），之后筛选一变就写回网址（刷新、分享都还在）。手机面板与库 B
 * 共用这一份，⛔ 各写一遍。
 */
export function useCivitaiLoraLibraryWithUrl(
  options: Pick<UseCivitaiLoraLibraryOptions, 'accumulate' | 'pageSize'> = {},
): UseCivitaiLoraLibraryReturn {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialFamilySlug = parseLoraLibraryFamilyParam(
    searchParams.get(LORA_LIBRARY_FAMILY_PARAM),
  )
  const initialSortParam = searchParams.get(LORA_LIBRARY_SORT_PARAM)
  const initialNsfwParam = searchParams.get(LORA_LIBRARY_NSFW_PARAM)
  const initialContentType = parseLoraLibraryTypeParam(
    searchParams.get(LORA_LIBRARY_TYPE_PARAM),
  )
  const library = useCivitaiLoraLibrary({
    ...options,
    initialBaseModel:
      initialFamilySlug === 'all'
        ? undefined
        : familySlugToCivitaiBaseModel(initialFamilySlug),
    initialSort:
      initialSortParam && isCivitaiLoraSort(initialSortParam)
        ? initialSortParam
        : undefined,
    initialSearch:
      searchParams.get(LORA_LIBRARY_SEARCH_PARAM)?.trim() || undefined,
    initialNsfwFilter:
      initialNsfwParam && isLoraNsfwFilter(initialNsfwParam)
        ? initialNsfwParam
        : undefined,
    initialContentType:
      initialContentType === 'all' ? undefined : initialContentType,
  })

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (library.baseModel === 'all') {
      params.delete(LORA_LIBRARY_FAMILY_PARAM)
    } else {
      params.set(
        LORA_LIBRARY_FAMILY_PARAM,
        civitaiBaseModelToFamilySlug(library.baseModel),
      )
    }
    if (library.debouncedSearch) {
      params.set(LORA_LIBRARY_SEARCH_PARAM, library.debouncedSearch)
    } else {
      params.delete(LORA_LIBRARY_SEARCH_PARAM)
    }
    if (library.sort === 'Highest Rated') {
      params.delete(LORA_LIBRARY_SORT_PARAM)
    } else {
      params.set(LORA_LIBRARY_SORT_PARAM, library.sort)
    }
    if (library.nsfwFilter === DEFAULT_LORA_NSFW_FILTER) {
      params.delete(LORA_LIBRARY_NSFW_PARAM)
    } else {
      params.set(LORA_LIBRARY_NSFW_PARAM, library.nsfwFilter)
    }
    if (library.contentType === DEFAULT_LORA_CONTENT_TYPE) {
      params.delete(LORA_LIBRARY_TYPE_PARAM)
    } else {
      params.set(LORA_LIBRARY_TYPE_PARAM, library.contentType)
    }
    const query = params.toString()
    const nextUrl = query ? `${pathname}?${query}` : pathname
    const currentQuery = searchParams.toString()
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname
    if (nextUrl === currentUrl) return
    router.replace(nextUrl, { scroll: false })
  }, [
    library.baseModel,
    library.sort,
    library.debouncedSearch,
    library.nsfwFilter,
    library.contentType,
    pathname,
    router,
    searchParams,
  ])

  return library
}
