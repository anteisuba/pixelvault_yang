'use client'

import { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { Boxes, Compass } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  DEFAULT_LORA_LIBRARY_SOURCE,
  LORA_LIBRARY_SOURCE_PARAM,
  LORA_LIBRARY_SOURCES,
  isLoraLibrarySource,
  type LoraLibrarySource,
} from '@/constants/lora'
import { usePathname, useRouter } from '@/i18n/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { FavoriteLoraRequest, LoraAssetRecord } from '@/types'
import {
  CivitaiCommunityBranch,
  type CivitaiCommunityBranchProps,
} from './CivitaiLibraryPane'
import { HuggingFaceLoraLibrary } from './HuggingFaceLoraLibrary'

export interface CommunitySourceBranchProps extends CivitaiCommunityBranchProps {
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  // §12 行A 压缩：pills（公开/我的）由 LoraWorkbench 持有并保持跨 section
  // 稳定渲染（crossfade 只包内层内容，壳不重挂载）——源 segmented 与行A
  // 右端控件槽因此也不能再是本组件自己的literal DOM 输出，否则它们会跟着
  // 内层 crossfade 一起重挂载/闪烁。两个槽位是 LoraWorkbench 持有的
  // 常驻 DOM 节点，通过 ref 传下来，本组件（及更深的两个 pane）只
  // `createPortal` 挂内容进去，state 仍留在各自原来的层级（不上提 hook）。
  navSlotNode: HTMLDivElement | null
  controlsSlotNode: HTMLDivElement | null
}

// S1 统一外壳（owner 2026-07-17 复核，覆盖 lora-workbench.md §2.1 正文的
// 单壳合成方案）：civitai / HuggingFace 保留两个独立 tab + 各自的 hook/组件
// ——只有视觉形制（chip 行、行首标、去盒化）和 family slug 值域是统一的。
// `source=` 深链语义 = tab 切换，默认 civitai 不入 URL（§2.5）。
export function CommunitySourceBranch({
  onFavorite,
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
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
      {/* §12 行A 源 segmented：portal 进 LoraWorkbench 渲染的常驻导航槽，
          与 pills 同一行左簇。 */}
      {navSlotNode
        ? createPortal(
            <Tabs
              value={source}
              onValueChange={(value) => {
                if (isLoraLibrarySource(value)) setSource(value)
              }}
            >
              <TabsList className="h-9 bg-muted/40">
                <TabsTrigger
                  value={LORA_LIBRARY_SOURCES.CIVITAI}
                  className="h-7 px-3 text-xs"
                >
                  <Compass className="size-3.5" aria-hidden />
                  {t('librarySourceCivitai')}
                </TabsTrigger>
                <TabsTrigger
                  value={LORA_LIBRARY_SOURCES.HUGGINGFACE}
                  className="h-7 px-3 text-xs"
                >
                  <Boxes className="size-3.5" aria-hidden />
                  {t('librarySourceHuggingFace')}
                </TabsTrigger>
              </TabsList>
            </Tabs>,
            navSlotNode,
          )
        : null}

      {source === LORA_LIBRARY_SOURCES.HUGGINGFACE ? (
        <HuggingFaceLoraLibrary
          onImport={onImport}
          onUnfavoriteByUrl={onUnfavoriteByUrl}
          isFavorited={isFavorited}
          controlsSlotNode={controlsSlotNode}
        />
      ) : (
        <CivitaiCommunityBranch
          onFavorite={onFavorite}
          onUnfavoriteByUrl={onUnfavoriteByUrl}
          isFavorited={isFavorited}
          controlsSlotNode={controlsSlotNode}
        />
      )}
    </>
  )
}
