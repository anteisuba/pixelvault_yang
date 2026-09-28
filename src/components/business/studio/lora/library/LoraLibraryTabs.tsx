'use client'

import { useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  DEFAULT_LORA_LIBRARY_SOURCE,
  LORA_LIBRARY_SOURCE_PARAM,
  LORA_LIBRARY_SOURCES,
  isLoraLibrarySource,
  type LoraLibrarySource,
} from '@/constants/lora'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { FavoriteLoraRequest, LoraAssetRecord } from '@/types'
import {
  CivitaiCommunityBranch,
  type CivitaiCommunityBranchProps,
} from './CivitaiLibraryPane'
import { HuggingFaceLoraLibrary } from './HuggingFaceLoraLibrary'

export interface CommunitySourceBranchProps extends CivitaiCommunityBranchProps {
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  // 手机（<1024）的库：搜索框 portal 进 LoraWorkbench 卡内那一格（跨 section
  // 稳定，不随内层 crossfade 闪）；来源 / 排序 / 筛选都在 pane 自己的筛选 sheet
  // 里。桌面是库 B（LoraLibraryStage），不走这里。
  searchSlotNode: HTMLDivElement | null
}

/** 库的来源（Civitai / Hugging Face）记在网址里（默认 Civitai 不入网址）：手机面板与库 B 同一份。 */
export function useLoraLibrarySource(): readonly [
  LoraLibrarySource,
  (next: LoraLibrarySource) => void,
] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const sourceParam = searchParams.get(LORA_LIBRARY_SOURCE_PARAM)
  const source: LoraLibrarySource =
    sourceParam && isLoraLibrarySource(sourceParam)
      ? sourceParam
      : DEFAULT_LORA_LIBRARY_SOURCE

  const setSource = useCallback(
    (next: LoraLibrarySource) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === DEFAULT_LORA_LIBRARY_SOURCE) {
        params.delete(LORA_LIBRARY_SOURCE_PARAM)
      } else {
        params.set(LORA_LIBRARY_SOURCE_PARAM, next)
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams],
  )

  return [source, setSource] as const
}

// 手机的库：civitai / HuggingFace 两个独立源 + 各自的 hook / 组件（`source=`
// 深链语义不变，默认 civitai 不入 URL）。
export function CommunitySourceBranch({
  onFavorite,
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
  searchSlotNode,
}: CommunitySourceBranchProps) {
  const [source, setSource] = useLoraLibrarySource()

  return (
    <>
      {source === LORA_LIBRARY_SOURCES.HUGGINGFACE ? (
        <HuggingFaceLoraLibrary
          onImport={onImport}
          onUnfavoriteByUrl={onUnfavoriteByUrl}
          isFavorited={isFavorited}
          searchSlotNode={searchSlotNode}
          controlsSlotNode={null}
          source={source}
          onSourceChange={setSource}
        />
      ) : (
        <CivitaiCommunityBranch
          onFavorite={onFavorite}
          onUnfavoriteByUrl={onUnfavoriteByUrl}
          isFavorited={isFavorited}
          searchSlotNode={searchSlotNode}
          source={source}
          onSourceChange={setSource}
        />
      )}
    </>
  )
}
