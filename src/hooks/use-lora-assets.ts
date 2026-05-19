'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import {
  listLoraAssetsAPI,
  listDiscoverLoraAssetsAPI,
  setLoraAssetVisibilityAPI,
} from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { LoraAssetRecord } from '@/types'

export interface UseLoraAssetsReturn {
  myAssets: LoraAssetRecord[]
  discoverAssets: LoraAssetRecord[]
  isLoadingMine: boolean
  isLoadingDiscover: boolean
  refresh: () => Promise<void>
  setVisibility: (assetId: string, isPublic: boolean) => Promise<boolean>
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

  const refresh = useCallback(async () => {
    setIsLoadingMine(true)
    setIsLoadingDiscover(true)
    const [mine, discover] = await Promise.all([
      listLoraAssetsAPI(),
      listDiscoverLoraAssetsAPI(),
    ])
    if (mine.success && mine.data) setMyAssets(mine.data)
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

  return {
    myAssets,
    discoverAssets,
    isLoadingMine,
    isLoadingDiscover,
    refresh,
    setVisibility,
  }
}
