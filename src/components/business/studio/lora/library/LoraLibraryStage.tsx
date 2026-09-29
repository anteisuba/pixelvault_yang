'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

import { LORA_LIBRARY_SOURCES } from '@/constants/lora'
import { useLoraLibraryAgent } from '@/hooks/use-lora-library-agent'
import type {
  CivitaiLoraLibraryItem,
  FavoriteLoraRequest,
  LoraAssetRecord,
} from '@/types'

import { LoraHuggingFaceBrowse } from './LoraHuggingFaceBrowse'
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
 * 来源记在网址里；Civitai 与 Hugging Face 同一副外壳（一行筛选 · 网格 · 详情页），
 * 来源差异（分级、总数、一个仓库几个文件）各自如实写。
 */
export function LoraLibraryStage({
  onFavorite,
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
}: LoraLibraryStageProps) {
  const t = useTranslations('LoraWorkbench')
  const [source, setSource] = useLoraLibrarySource()
  // 助手当面搜只搜 Civitai（lora-assistant §13.1）：请求到了而你在 Hugging Face，
  // 先切回来，请求留给 Civitai 那一格去执行。
  const agentRequest = useLoraLibraryAgent().request
  useEffect(() => {
    if (agentRequest && source === LORA_LIBRARY_SOURCES.HUGGINGFACE) {
      setSource(LORA_LIBRARY_SOURCES.CIVITAI)
    }
  }, [agentRequest, setSource, source])

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
      <LoraHuggingFaceBrowse
        sourceSwitch={sourceSwitch}
        onImport={onImport}
        onUnfavoriteByUrl={onUnfavoriteByUrl}
        isFavorited={isFavorited}
      />
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
