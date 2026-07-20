'use client'

import { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

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
import { LoraLibrarySegmented } from './LoraLibrarySegmented'

export interface CommunitySourceBranchProps extends CivitaiCommunityBranchProps {
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  // R1 顶栏（lora-library.md §3）：搜索/来源/控件收进 LoraWorkbench 常驻顶栏。
  // 三个 DOM 落点由 LoraWorkbench 持有并跨 section 稳定（顶栏不随内层
  // crossfade 闪烁）——本组件与更深的两个 pane 只 `createPortal` 挂内容进去，
  // state 仍留各自原层级（不上提 hook）。searchSlot = 搜索框；navSlot = 来源
  // 下拉；controlsSlot = 排序/NSFW/刷新。
  searchSlotNode: HTMLDivElement | null
  navSlotNode: HTMLDivElement | null
  controlsSlotNode: HTMLDivElement | null
}

// S1 统一外壳（owner 2026-07-17 复核）：civitai / HuggingFace 保留两个独立源
// + 各自的 hook/组件，只有视觉形制统一。R1 把源切换从 segmented tab 换成
// 与确认图一致的「Civitai ▾」下拉（`source=` 深链语义不变，默认 civitai 不
// 入 URL）。
export function CommunitySourceBranch({
  onFavorite,
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
  searchSlotNode,
  navSlotNode,
  controlsSlotNode,
}: CommunitySourceBranchProps) {
  const t = useTranslations('LoraWorkbench')
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

  return (
    <>
      {/* 源切换：portal 进 LoraWorkbench 顶栏的来源槽，与公开/我的、排序等
          同一行右簇。R1 close-review：只有两个源，owner「不要下拉」——用同一套
          segmented 切换。 */}
      {navSlotNode
        ? createPortal(
            <LoraLibrarySegmented
              ariaLabel={t('librarySourceLabel')}
              value={source}
              onChange={(value) => setSource(value)}
              options={[
                {
                  value: LORA_LIBRARY_SOURCES.CIVITAI,
                  label: t('librarySourceCivitai'),
                },
                {
                  value: LORA_LIBRARY_SOURCES.HUGGINGFACE,
                  label: t('librarySourceHuggingFace'),
                },
              ]}
            />,
            navSlotNode,
          )
        : null}

      {source === LORA_LIBRARY_SOURCES.HUGGINGFACE ? (
        <HuggingFaceLoraLibrary
          onImport={onImport}
          onUnfavoriteByUrl={onUnfavoriteByUrl}
          isFavorited={isFavorited}
          searchSlotNode={searchSlotNode}
          controlsSlotNode={controlsSlotNode}
        />
      ) : (
        <CivitaiCommunityBranch
          onFavorite={onFavorite}
          onUnfavoriteByUrl={onUnfavoriteByUrl}
          isFavorited={isFavorited}
          searchSlotNode={searchSlotNode}
          controlsSlotNode={controlsSlotNode}
        />
      )}
    </>
  )
}
