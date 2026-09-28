'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  DEFAULT_HUGGINGFACE_LORA_SORT,
  DEFAULT_LORA_CONTENT_TYPE,
  LORA_LIBRARY_FAMILY_PARAM,
  LORA_LIBRARY_SEARCH_PARAM,
  LORA_LIBRARY_SORT_PARAM,
  LORA_LIBRARY_TYPE_PARAM,
  familySlugToHuggingFaceFamily,
  huggingFaceFamilyToFamilySlug,
  isHuggingFaceLoraSort,
  parseLoraLibraryFamilyParam,
  parseLoraLibraryTypeParam,
} from '@/constants/lora'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  useHuggingFaceLoraLibrary,
  type UseHuggingFaceLoraLibraryOptions,
  type UseHuggingFaceLoraLibraryReturn,
} from '@/hooks/use-huggingface-lora-library'

/**
 * Hugging Face 库 + 网址：首帧按网址里的 family / q / sort / type 起步，之后筛选一变
 * 就写回网址。手机面板与库 B 共用这一份（同 `useCivitaiLoraLibraryWithUrl`），⛔ 各写一遍。
 */
export function useHuggingFaceLoraLibraryWithUrl(
  options: Pick<UseHuggingFaceLoraLibraryOptions, 'accumulate' | 'limit'> = {},
): UseHuggingFaceLoraLibraryReturn {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialFamilySlug = parseLoraLibraryFamilyParam(
    searchParams.get(LORA_LIBRARY_FAMILY_PARAM),
  )
  const initialSortParam = searchParams.get(LORA_LIBRARY_SORT_PARAM)
  const initialContentType = parseLoraLibraryTypeParam(
    searchParams.get(LORA_LIBRARY_TYPE_PARAM),
  )
  const library = useHuggingFaceLoraLibrary({
    ...options,
    initialSearch:
      searchParams.get(LORA_LIBRARY_SEARCH_PARAM)?.trim() || undefined,
    initialBaseModelFamily: familySlugToHuggingFaceFamily(initialFamilySlug),
    initialSort:
      initialSortParam && isHuggingFaceLoraSort(initialSortParam)
        ? initialSortParam
        : undefined,
    initialContentType:
      initialContentType === 'all' ? undefined : initialContentType,
  })

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const familySlug = huggingFaceFamilyToFamilySlug(library.baseModelFamily)
    if (familySlug === 'all') {
      params.delete(LORA_LIBRARY_FAMILY_PARAM)
    } else {
      params.set(LORA_LIBRARY_FAMILY_PARAM, familySlug)
    }
    if (library.debouncedSearch) {
      params.set(LORA_LIBRARY_SEARCH_PARAM, library.debouncedSearch)
    } else {
      params.delete(LORA_LIBRARY_SEARCH_PARAM)
    }
    if (library.sort === DEFAULT_HUGGINGFACE_LORA_SORT) {
      params.delete(LORA_LIBRARY_SORT_PARAM)
    } else {
      params.set(LORA_LIBRARY_SORT_PARAM, library.sort)
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
    library.baseModelFamily,
    library.sort,
    library.debouncedSearch,
    library.contentType,
    pathname,
    router,
    searchParams,
  ])

  return library
}
