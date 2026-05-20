'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import {
  favoriteLoraAPI,
  listLoraAssetsAPI,
  listDiscoverLoraAssetsAPI,
  setLoraAssetVisibilityAPI,
  unfavoriteLoraAPI,
} from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  CivitaiLoraLibraryItem,
  FavoriteLoraRequest,
  LoraAssetRecord,
} from '@/types'

export interface UseLoraAssetsReturn {
  myAssets: LoraAssetRecord[]
  trainedAssets: LoraAssetRecord[]
  favoriteAssets: LoraAssetRecord[]
  discoverAssets: LoraAssetRecord[]
  isLoadingMine: boolean
  isLoadingDiscover: boolean
  errorMine: string | null
  refresh: () => Promise<void>
  setVisibility: (assetId: string, isPublic: boolean) => Promise<boolean>
  favoriteCivitaiLora: (
    item: CivitaiLoraLibraryItem,
  ) => Promise<LoraAssetRecord | null>
  unfavoriteAsset: (assetId: string) => Promise<boolean>
  unfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
}

/**
 * Two-feed LoRA library hook for the /studio/lora workbench.
 *
 * Owns:
 *   - `myAssets`   — owned + curated (from /api/lora-assets)
 *   - `discoverAssets` — public LoRAs from other users (from /api/lora-assets/discover)
 *
 * `setVisibility` updates an asset in `myAssets` optimistically.
 * On success, the canonical row replaces the optimistic one. On
 * failure, the optimistic flip reverts and a toast surfaces.
 */
export function useLoraAssets(): UseLoraAssetsReturn {
  const t = useTranslations('LoraWorkbench')
  const [myAssets, setMyAssets] = useState<LoraAssetRecord[]>([])
  const [discoverAssets, setDiscoverAssets] = useState<LoraAssetRecord[]>([])
  const [isLoadingMine, setIsLoadingMine] = useState(true)
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(true)
  // 把 mine 的失败原因暴露给 UI，否则一次网络错误会变成「假阴性空状态」
  // — 用户会以为自己的 LoRA 全没了。错误清晰显示 + 重试入口比静默更诚实。
  const [errorMine, setErrorMine] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoadingMine(true)
    setIsLoadingDiscover(true)
    setErrorMine(null)
    const [mine, discover] = await Promise.all([
      listLoraAssetsAPI(),
      listDiscoverLoraAssetsAPI(),
    ])
    if (mine.success && mine.data) {
      setMyAssets(mine.data)
    } else if (!mine.success) {
      setErrorMine(mine.error ?? 'Failed to load LoRA assets')
    }
    if (discover.success && discover.data) setDiscoverAssets(discover.data)
    setIsLoadingMine(false)
    setIsLoadingDiscover(false)
  }, [])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  const setVisibility = useCallback(
    async (assetId: string, isPublic: boolean): Promise<boolean> => {
      // Optimistic flip
      const previous = myAssets
      setMyAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, isPublic } : a)),
      )

      const result = await setLoraAssetVisibilityAPI(assetId, isPublic)
      if (!result.success || !result.data) {
        setMyAssets(previous)
        toast.error(result.error ?? t('visibilityUpdateFailed'))
        return false
      }
      setMyAssets((prev) =>
        prev.map((a) => (a.id === assetId ? result.data! : a)),
      )
      toast.success(isPublic ? t('madePublic') : t('madePrivate'))
      return true
    },
    [myAssets, t],
  )

  const trainedAssets = myAssets.filter(
    (a) => a.source === 'trained' || a.source === 'curated',
  )
  const favoriteAssets = myAssets.filter((a) => a.source === 'imported')

  const favoriteCivitaiLora = useCallback(
    async (item: CivitaiLoraLibraryItem): Promise<LoraAssetRecord | null> => {
      const payload: FavoriteLoraRequest = {
        name: item.name,
        triggerWord: item.triggerWord,
        loraUrl: item.loraUrl,
        type: item.type,
        baseModelFamily: item.baseModelFamily,
        provider: item.provider,
        coverImageUrl: item.coverImageUrl,
      }
      const result = await favoriteLoraAPI(payload)
      if (!result.success || !result.data) {
        toast.error(result.error ?? t('favoriteFailed'))
        return null
      }
      setMyAssets((prev) => {
        if (prev.some((a) => a.id === result.data!.id)) return prev
        return [result.data!, ...prev]
      })
      toast.success(t('favoriteAdded'))
      return result.data
    },
    [t],
  )

  const unfavoriteAsset = useCallback(
    async (assetId: string): Promise<boolean> => {
      const previous = myAssets
      setMyAssets((prev) => prev.filter((a) => a.id !== assetId))
      const result = await unfavoriteLoraAPI(assetId)
      if (!result.success) {
        setMyAssets(previous)
        toast.error(result.error ?? t('favoriteFailed'))
        return false
      }
      toast.success(t('favoriteRemoved'))
      return true
    },
    [myAssets, t],
  )

  const isFavorited = useCallback(
    (loraUrl: string): boolean =>
      favoriteAssets.some((a) => a.loraUrl === loraUrl),
    [favoriteAssets],
  )

  const unfavoriteByUrl = useCallback(
    async (loraUrl: string): Promise<boolean> => {
      const match = favoriteAssets.find((a) => a.loraUrl === loraUrl)
      if (!match) return false
      return unfavoriteAsset(match.id)
    },
    [favoriteAssets, unfavoriteAsset],
  )

  return {
    myAssets,
    trainedAssets,
    favoriteAssets,
    discoverAssets,
    isLoadingMine,
    isLoadingDiscover,
    errorMine,
    refresh,
    setVisibility,
    favoriteCivitaiLora,
    unfavoriteAsset,
    unfavoriteByUrl,
    isFavorited,
  }
}
