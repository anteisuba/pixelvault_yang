'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { QUERY_KEYS } from '@/constants/query'
import { buildLibraryFavoriteRequest } from '@/lib/lora-source-snapshot'
import { queryClient } from '@/lib/query-client'
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

const EMPTY: LoraAssetRecord[] = []

async function fetchMyLoraAssets(): Promise<LoraAssetRecord[]> {
  const result = await listLoraAssetsAPI()
  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to load LoRA assets')
  }
  return result.data
}

async function fetchDiscoverLoraAssets(): Promise<LoraAssetRecord[]> {
  const result = await listDiscoverLoraAssetsAPI()
  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to load LoRA discover feed')
  }
  return result.data
}

function readMine(): LoraAssetRecord[] {
  return (
    queryClient.getQueryData<LoraAssetRecord[]>(QUERY_KEYS.loraAssets) ?? []
  )
}

function writeMine(
  update: (current: LoraAssetRecord[]) => LoraAssetRecord[],
): void {
  queryClient.setQueryData<LoraAssetRecord[]>(
    QUERY_KEYS.loraAssets,
    (current) => update(current ?? []),
  )
}

/**
 * Two-feed LoRA library hook for the /studio/lora workbench.
 *
 * Owns:
 *   - `myAssets`   — owned + curated (from /api/lora-assets)
 *   - `discoverAssets` — public LoRAs from other users (from /api/lora-assets/discover)
 *
 * 两份都在共用查询缓存里（`QUERY_KEYS.loraAssets` / `loraDiscover`）：库整页、挑选框、
 * LoRA 台同时挂着也只拉一次，在一处收藏，别处的星马上跟着变。
 *
 * `setVisibility` updates an asset in `myAssets` optimistically.
 * On success, the canonical row replaces the optimistic one. On
 * failure, the optimistic flip reverts and a toast surfaces.
 */
export function useLoraAssets(): UseLoraAssetsReturn {
  const t = useTranslations('LoraWorkbench')
  const mine = useQuery(
    { queryKey: QUERY_KEYS.loraAssets, queryFn: fetchMyLoraAssets },
    queryClient,
  )
  const discover = useQuery(
    { queryKey: QUERY_KEYS.loraDiscover, queryFn: fetchDiscoverLoraAssets },
    queryClient,
  )
  const myAssets = mine.data ?? EMPTY
  const discoverAssets = discover.data ?? EMPTY
  // 把 mine 的失败原因暴露给 UI，否则一次网络错误会变成「假阴性空状态」
  // — 用户会以为自己的 LoRA 全没了。错误清晰显示 + 重试入口比静默更诚实。
  const errorMine = mine.error?.message ?? null

  const { refetch: refetchMine } = mine
  const { refetch: refetchDiscover } = discover
  const refresh = useCallback(async () => {
    await Promise.all([refetchMine(), refetchDiscover()])
  }, [refetchMine, refetchDiscover])

  const setVisibility = useCallback(
    async (assetId: string, isPublic: boolean): Promise<boolean> => {
      // Optimistic flip
      const previous = readMine()
      writeMine((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, isPublic } : a)),
      )

      const result = await setLoraAssetVisibilityAPI(assetId, isPublic)
      if (!result.success || !result.data) {
        writeMine(() => previous)
        toast.error(result.error ?? t('visibilityUpdateFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return false
      }
      writeMine((prev) =>
        prev.map((a) => (a.id === assetId ? result.data! : a)),
      )
      toast.success(isPublic ? t('madePublic') : t('madePrivate'), {
        duration: LORA_TOAST_DURATION_MS,
      })
      return true
    },
    [t],
  )

  const trainedAssets = useMemo(
    () =>
      myAssets.filter((a) => a.source === 'trained' || a.source === 'curated'),
    [myAssets],
  )
  const favoriteAssets = useMemo(
    () => myAssets.filter((a) => a.source === 'imported'),
    [myAssets],
  )

  // 参数类型放宽到 LoraAssetRecord —— CivitaiLoraLibraryItem（公开库卡片）
  // 和 discoverAssets 里的记录（我的页「推荐你收藏」条）结构上都满足
  // FavoriteLoraRequest 所需字段，两处收藏入口共用同一个实现。
  const favoriteExternalLora = useCallback(
    async (payload: FavoriteLoraRequest): Promise<LoraAssetRecord | null> => {
      const result = await favoriteLoraAPI(payload)
      if (!result.success || !result.data) {
        // 服务端的 error 是给日志看的英文（如 "Invalid body"），不直接给用户。
        toast.error(t('favoriteFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return null
      }
      writeMine((prev) => {
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
    (item: LoraAssetRecord): Promise<LoraAssetRecord | null> =>
      favoriteExternalLora(buildLibraryFavoriteRequest(item)),
    [favoriteExternalLora],
  )

  const unfavoriteAsset = useCallback(
    async (assetId: string): Promise<boolean> => {
      const previous = readMine()
      writeMine((prev) => prev.filter((a) => a.id !== assetId))
      const result = await unfavoriteLoraAPI(assetId)
      if (!result.success) {
        writeMine(() => previous)
        toast.error(result.error ?? t('favoriteFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return false
      }
      toast.success(t('favoriteRemoved'), { duration: LORA_TOAST_DURATION_MS })
      return true
    },
    [t],
  )

  // 永久删除自训 LoRA — 乐观从 myAssets 移除，失败回滚。
  // toast 包含资产名让用户能识别「是哪个被删了」。后端只接受
  // source==='trained' 且 owner 匹配，UI 调用方有责任只在
  // 满足条件的卡片上挂这个 callback（LoraAssetCard 已经做了
  // 菜单条件渲染）。
  const deleteAsset = useCallback(
    async (assetId: string): Promise<boolean> => {
      const previous = readMine()
      const target = previous.find((a) => a.id === assetId)
      writeMine((prev) => prev.filter((a) => a.id !== assetId))
      const result = await deleteLoraAssetAPI(assetId)
      if (!result.success) {
        writeMine(() => previous)
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
    [t],
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
    isLoadingMine: mine.isPending,
    isLoadingDiscover: discover.isPending,
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
