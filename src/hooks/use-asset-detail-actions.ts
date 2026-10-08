'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { assetDetailPath } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import {
  createRecipeFromGenerationAPI,
  deleteGenerationAPI,
  downloadRemoteAsset,
  setAudioCoverAPI,
  setGenerationVisibility,
  toggleLikeAPI,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { runUndoableAction } from '@/lib/undoable-action'
import {
  openExternalAsset,
  triggerDirectAssetDownload,
} from '@/lib/asset-links'
import type { GenerationRecord } from '@/types'

export type AssetPublishScope = 'private' | 'asset' | 'assetAndPrompt'

interface UseAssetDetailActionsOptions {
  generation: GenerationRecord | null
  /**
   * 做同款 / 删除之后怎么离开这一层：抽屉与查看器关上，整页退回素材库。
   * 不给 = 不用离开（整页做同款时路由本来就换走了）。
   */
  onLeave?: (reason: 'remix' | 'delete') => void
  /** 删除落库之后（素材页据此把这一张从大河里拿掉、刷新计数）。 */
  onDeleted?: (id: string) => void
  /**
   * 给了 = 删除可撤销（owner 2026-10-08「提示与弹窗」第 2 题）：`onDeleted` 立刻把这一张
   * 拿掉，底部黑条挂「撤销」5 秒，过了才真的落库；点撤销 / 落库失败都用它把这一张放回去。
   * 不给（整页 `/assets/<id>`，删完就离开、没有列表可放回）= 照旧立刻删。
   */
  onRestored?: (generation: GenerationRecord) => void
  /** 发布 / 收藏 / 封面落库之后（大河跟着改这一张）。 */
  onUpdated?: (id: string, patch: Partial<GenerationRecord>) => void
}

function getDownloadTarget(generation: GenerationRecord): string {
  if (generation.outputType === 'MODEL_3D' && generation.modelUrl) {
    return generation.modelUrl
  }
  return generation.url
}

function getAssetFileName(generation: GenerationRecord): string {
  if (generation.outputType === 'MODEL_3D' && generation.modelUrl) {
    return `pixelvault-${generation.id.slice(0, 8)}.glb`
  }
  const ext = generation.mimeType.split('/')[1] || 'bin'
  return `pixelvault-${generation.id.slice(0, 8)}.${ext}`
}

/**
 * 一张素材的全部动作 —— 手机的全屏详情、`/assets/<id>` 整页与桌面的就地查看器
 * 共用这一份（pages/assets.md §3「详情」），⛔ 各写一套。
 */
export function useAssetDetailActions({
  generation,
  onLeave,
  onDeleted,
  onRestored,
  onUpdated,
}: UseAssetDetailActionsOptions) {
  const t = useTranslations('AssetsPage')
  const tFeedback = useTranslations('Feedback')
  const tPrompts = useTranslations('PromptLibrary')
  const tErrors = useTranslations('Errors')
  const locale = useLocale()
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isFavoriting, setIsFavoriting] = useState(false)
  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isPublishScopeOpen, setIsPublishScopeOpen] = useState(false)
  const [isSettingCover, setIsSettingCover] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [isLinkCopied, setIsLinkCopied] = useState(false)

  const currentPublishScope: AssetPublishScope = !generation?.isPublic
    ? 'private'
    : generation.isPromptPublic
      ? 'assetAndPrompt'
      : 'asset'

  const remix = () => {
    if (!generation) return
    const mode =
      generation.outputType === 'VIDEO'
        ? 'video'
        : generation.outputType === 'AUDIO'
          ? 'audio'
          : generation.outputType === 'MODEL_3D'
            ? '3d'
            : 'image'
    // 3D Studio uses ?gen=<id> to load an existing GLB for viewing,
    // not ?remix= (since 3D outputs aren't remix-able sources).
    const param = mode === '3d' ? 'gen' : 'remix'
    router.push(`/studio/${mode}?${param}=${generation.id}`)
    onLeave?.('remix')
  }

  const remove = async () => {
    if (!generation || isDeleting) return
    const generationId = generation.id
    if (onRestored) {
      const removed = generation
      onLeave?.('delete')
      runUndoableAction({
        message: t('detailDeleted'),
        undoLabel: tFeedback('undo'),
        apply: () => onDeleted?.(generationId),
        undo: () => onRestored(removed),
        commit: async () => {
          try {
            const response = await deleteGenerationAPI(generationId)
            if (response.success) return
            toast.error(response.error ?? t('detailDeleteFailed'))
          } catch {
            toast.error(t('detailDeleteFailed'))
          }
          onRestored(removed)
        },
      })
      return
    }
    setIsDeleting(true)
    onLeave?.('delete')
    try {
      const response = await deleteGenerationAPI(generationId)
      if (response.success) {
        toast.success(t('detailDeleted'))
        onDeleted?.(generationId)
      } else {
        toast.error(response.error ?? t('detailDeleteFailed'))
      }
    } catch {
      toast.error(t('detailDeleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const applyPublishScope = async (scope: AssetPublishScope) => {
    if (!generation || isPublishing) return
    if (scope === currentPublishScope) {
      setIsPublishScopeOpen(false)
      return
    }
    const values =
      scope === 'private'
        ? { isPublic: false, isPromptPublic: false }
        : scope === 'asset'
          ? { isPublic: true, isPromptPublic: false }
          : { isPublic: true, isPromptPublic: true }

    setIsPublishing(true)
    try {
      const response = await setGenerationVisibility(generation.id, values)
      if (response.success && response.data) {
        onUpdated?.(generation.id, {
          isPublic: response.data.isPublic,
          isPromptPublic: response.data.isPromptPublic,
        })
        setIsPublishScopeOpen(false)
        toast.success(
          response.data.isPublic
            ? t('detailPublished')
            : t('detailUnpublished'),
        )
      } else {
        // 带 i18nKey 的（公开闸拦下）说人话，其余仍是原来那句。
        toast.error(
          getApiErrorMessage(tErrors, response, t('detailPublishFailed')),
        )
      }
    } catch {
      toast.error(t('detailPublishFailed'))
    } finally {
      setIsPublishing(false)
    }
  }

  const toggleFavorite = async () => {
    if (!generation || isFavoriting) return
    setIsFavoriting(true)
    try {
      const response = await toggleLikeAPI(generation.id)
      if (response.success && response.data) {
        onUpdated?.(generation.id, {
          isLiked: response.data.liked,
          likeCount: response.data.likeCount,
        })
        toast.success(
          response.data.liked ? t('detailFavorited') : t('detailUnfavorited'),
        )
      } else {
        toast.error(t('detailFavoriteFailed'))
      }
    } catch {
      toast.error(t('detailFavoriteFailed'))
    } finally {
      setIsFavoriting(false)
    }
  }

  const saveRecipe = async () => {
    if (!generation || isSavingRecipe) return
    setIsSavingRecipe(true)
    try {
      const response = await createRecipeFromGenerationAPI({
        generationId: generation.id,
      })
      if (response.success) {
        toast.success(tPrompts('saveTemplateSuccess'))
      } else {
        toast.error(response.error ?? tPrompts('saveTemplateFailed'))
      }
    } catch {
      toast.error(tPrompts('saveTemplateFailed'))
    } finally {
      setIsSavingRecipe(false)
    }
  }

  /** 开始下载了返回 `true`（调用方在键上写「✓ 已开始下载」）。 */
  const download = async (): Promise<boolean> => {
    if (!generation || isDownloading) return false
    const downloadUrl = getDownloadTarget(generation)
    const fileName = getAssetFileName(generation)
    setIsDownloading(true)
    try {
      const response = await downloadRemoteAsset(downloadUrl, fileName)
      if (!response.success) {
        toast.error(
          getApiErrorMessage(tErrors, response, t('detailDownloadFailed')),
        )
        triggerDirectAssetDownload(downloadUrl, fileName)
      }
      return true
    } finally {
      setIsDownloading(false)
    }
  }

  const copyLink = async () => {
    if (!generation) return
    // 分享出去的是**素材详情页**（`/assets/<id>`），不是抽屉 deeplink：
    // 对方打开后拿到可刷新、可后退的真实路由。
    const shareUrl = `${window.location.origin}/${locale}${assetDetailPath(generation.id)}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setIsLinkCopied(true)
      toast.success(t('detailLinkCopied'))
      window.setTimeout(() => setIsLinkCopied(false), 2000)
    } catch {
      toast.error(t('detailCopyLinkFailed'))
    }
  }

  const openOriginal = () => {
    if (!generation) return
    openExternalAsset(getDownloadTarget(generation))
  }

  const applyCover = async (coverImageUrl: string) => {
    if (!generation || isSettingCover) return
    setCoverPickerOpen(false)
    setIsSettingCover(true)
    try {
      const response = await setAudioCoverAPI(generation.id, coverImageUrl)
      if (response.success) {
        // Cover is stored in previewUrl, which the asset browser reads back.
        onUpdated?.(generation.id, { previewUrl: coverImageUrl })
        toast.success(t('detailCoverSet'))
      } else {
        toast.error(response.error ?? t('detailCoverSetFailed'))
      }
    } catch {
      toast.error(t('detailCoverSetFailed'))
    } finally {
      setIsSettingCover(false)
    }
  }

  return {
    remix,
    remove,
    isDeleting,
    currentPublishScope,
    isPublishScopeOpen,
    setIsPublishScopeOpen,
    applyPublishScope,
    isPublishing,
    toggleFavorite,
    isFavoriting,
    saveRecipe,
    isSavingRecipe,
    download,
    isDownloading,
    copyLink,
    isLinkCopied,
    openOriginal,
    coverPickerOpen,
    setCoverPickerOpen,
    applyCover,
    isSettingCover,
  }
}

export type AssetDetailActions = ReturnType<typeof useAssetDetailActions>
