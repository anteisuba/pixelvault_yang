'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import {
  deleteLoraAssetAPI,
  favoriteLoraAPI,
  listLoraAssetsAPI,
  listDiscoverLoraAssetsAPI,
  setLoraAssetVisibilityAPI,
  unfavoriteLoraAPI,
} from '@/lib/api-client/lora-assets'
import { LORA_TOAST_DURATION_MS } from '@/constants/lora'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { FavoriteLoraRequest, LoraAssetRecord } from '@/types'

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
  favoriteExternalLora: (
    input: FavoriteLoraRequest,
  ) => Promise<LoraAssetRecord | null>
  favoriteCivitaiLora: (
    item: LoraAssetRecord,
  ) => Promise<LoraAssetRecord | null>
  unfavoriteAsset: (assetId: string) => Promise<boolean>
  unfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  deleteAsset: (assetId: string) => Promise<boolean>
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
        toast.error(result.error ?? t('visibilityUpdateFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return false
      }
      setMyAssets((prev) =>
        prev.map((a) => (a.id === assetId ? result.data! : a)),
      )
      toast.success(isPublic ? t('madePublic') : t('madePrivate'), {
        duration: LORA_TOAST_DURATION_MS,
      })
      return true
    },
    [myAssets, t],
  )

  const trainedAssets = myAssets.filter(
    (a) => a.source === 'trained' || a.source === 'curated',
  )
  const favoriteAssets = myAssets.filter((a) => a.source === 'imported')

  // 参数类型放宽到 LoraAssetRecord —— CivitaiLoraLibraryItem（公开库卡片）
  // 和 discoverAssets 里的记录（我的页「推荐你收藏」条）结构上都满足
  // FavoriteLoraRequest 所需字段，两处收藏入口共用同一个实现。
  const favoriteExternalLora = useCallback(
    async (payload: FavoriteLoraRequest): Promise<LoraAssetRecord | null> => {
      const result = await favoriteLoraAPI(payload)
      if (!result.success || !result.data) {
        toast.error(result.error ?? t('favoriteFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return null
      }
      setMyAssets((prev) => {
        if (prev.some((a) => a.id === result.data!.id)) return prev
        return [result.data!, ...prev]
      })
      toast.success(t('favoriteAdded'), { duration: LORA_TOAST_DURATION_MS })
      return result.data
    },
    [t],
  )

  // Keep the existing Civitai callback shape for the public library and
  // discover feed. HF imports use the generic request above because the user
  // must choose a concrete repository file before importing it.
  const favoriteCivitaiLora = useCallback(
    async (item: LoraAssetRecord): Promise<LoraAssetRecord | null> => {
      const payload: FavoriteLoraRequest = {
        name: item.name,
        triggerWord: item.triggerWord,
        loraUrl: item.loraUrl,
        type: item.type,
        baseModelFamily: item.baseModelFamily,
        provider: item.provider,
        coverImageUrl: item.coverImageUrl,
        // Carry Civitai provenance so "贴近来源图" still works after a reload —
        // these are dropped on the wire today, leaving favorited LoRAs unable
        // to reconstruct their source prompt.
        recommendedPrompt: item.recommendedPrompt,
        modelId: item.modelId,
        modelVersionId: item.modelVersionId,
        fileHashAutoV3: item.fileHashAutoV3,
      }
      return favoriteExternalLora(payload)
    },
    [favoriteExternalLora],
  )

  const unfavoriteAsset = useCallback(
    async (assetId: string): Promise<boolean> => {
      const previous = myAssets
      setMyAssets((prev) => prev.filter((a) => a.id !== assetId))
      const result = await unfavoriteLoraAPI(assetId)
      if (!result.success) {
        setMyAssets(previous)
        toast.error(result.error ?? t('favoriteFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return false
      }
      toast.success(t('favoriteRemoved'), { duration: LORA_TOAST_DURATION_MS })
      return true
    },
    [myAssets, t],
  )

  // 永久删除自训 LoRA — 乐观从 myAssets 移除，失败回滚。
  // toast 包含资产名让用户能识别「是哪个被删了」。后端只接受
  // source==='trained' 且 owner 匹配，UI 调用方有责任只在
  // 满足条件的卡片上挂这个 callback（LoraAssetCard 已经做了
  // 菜单条件渲染）。
  const deleteAsset = useCallback(
    async (assetId: string): Promise<boolean> => {
      const target = myAssets.find((a) => a.id === assetId)
      const previous = myAssets
      setMyAssets((prev) => prev.filter((a) => a.id !== assetId))
      const result = await deleteLoraAssetAPI(assetId)
      if (!result.success) {
        setMyAssets(previous)
        toast.error(result.error ?? t('assetDeleteFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return false
      }
      toast.success(
        target
          ? t('assetDeleted', { name: target.name })
          : t('assetDeleted', { name: '' }),
        { duration: LORA_TOAST_DURATION_MS },
      )
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
    favoriteExternalLora,
    favoriteCivitaiLora,
    unfavoriteAsset,
    unfavoriteByUrl,
    deleteAsset,
    isFavorited,
  }
}
