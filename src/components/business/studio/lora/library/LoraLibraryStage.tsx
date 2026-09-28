'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { LORA_LIBRARY_SOURCES } from '@/constants/lora'
import type {
  CivitaiLoraLibraryItem,
  FavoriteLoraRequest,
  LoraAssetRecord,
} from '@/types'

import { HuggingFaceLoraLibrary } from './HuggingFaceLoraLibrary'
import { LoraLibraryBrowse } from './LoraLibraryBrowse'
import { LoraLibrarySegmented } from './LoraLibrarySegmented'
import { useLoraLibrarySource } from './LoraLibraryTabs'

interface LoraLibraryStageProps {
  onFavorite: (item: CivitaiLoraLibraryItem) => Promise<LoraAssetRecord | null>
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
}

/**
 * 桌面库 B 的「库」那一格（lora-library.md §3）：住在生成台那副舞台里，占满舞台右侧。
 * 来源记在网址里；Civitai 走库 B 的网格（`LoraLibraryBrowse`）。
 *
 * ⚠ Hugging Face 这一路还没换成库 B 的网格（施工 ⑥）：暂时把原来的面板放进同一行
 *   筛选里 —— 它的搜索框与排序经 portal 落进这一行的两个槽。
 */
export function LoraLibraryStage({
  onFavorite,
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
}: LoraLibraryStageProps) {
  const t = useTranslations('LoraWorkbench')
  const [source, setSource] = useLoraLibrarySource()
  const [searchSlot, setSearchSlot] = useState<HTMLDivElement | null>(null)
  const [controlsSlot, setControlsSlot] = useState<HTMLDivElement | null>(null)

  const sourceSwitch = (
    <LoraLibrarySegmented
      ariaLabel={t('librarySourceLabel')}
      value={source}
      onChange={setSource}
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
    />
  )

  if (source === LORA_LIBRARY_SOURCES.HUGGINGFACE) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-5 pt-4">
          <div ref={setSearchSlot} className="min-w-0 flex-1" />
          {sourceSwitch}
          <div
            ref={setControlsSlot}
            className="flex shrink-0 items-center gap-2"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <HuggingFaceLoraLibrary
            onImport={onImport}
            onUnfavoriteByUrl={onUnfavoriteByUrl}
            isFavorited={isFavorited}
            searchSlotNode={searchSlot}
            controlsSlotNode={controlsSlot}
            source={source}
            onSourceChange={setSource}
          />
        </div>
      </div>
    )
  }

  return (
    <LoraLibraryBrowse
      sourceSwitch={sourceSwitch}
      onFavorite={onFavorite}
      onUnfavoriteByUrl={onUnfavoriteByUrl}
      isFavorited={isFavorited}
    />
  )
}
