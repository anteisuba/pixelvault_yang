'use client'

/**
 * 视频工作台的**具名参考槽**（第二期，owner 2026-09-07 定）。
 *
 * ⭐ 三条落法**汇到同一处写入**：拖入 / 素材库选择 / 助手 `mount_reference slot`。
 * 前两条走这颗 hook 的 `setFrame` / `addVideo`，第三条走宿主
 * （`use-studio-workbench-operator-host.ts` 的 `addReference(url, slot)`）——
 * 两边 dispatch 的是**同一个 action**（`SET_VIDEO_FRAME_SLOT` /
 * `SET_VIDEO_REFERENCE_VIDEOS`），所以撤销、快照、发送口只认识一份真相。
 * ⛔ 别在组件里另写一条写入：那是「同一件事两个入口」，而其中一个会漏掉撤销登记。
 *
 * ⚠ 槽的可见性来自**发送契约**（`getVideoWorkbenchSlots`），⛔ 不由组件自己判
 * 模型：不支持的槽整个不渲染，不摆禁用占位。
 */

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useStudioForm } from '@/contexts/studio-context'
import { uploadImageFileAPI } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import {
  getVideoWorkbenchSlots,
  type VideoWorkbenchSlots,
} from '@/lib/studio/video-workbench-slots'

export interface UseVideoReferenceSlotsReturn {
  /** 这一刻该出现哪几个槽 —— 由当前模型的发送契约算出来。 */
  visible: VideoWorkbenchSlots
  first: string | null
  last: string | null
  videos: readonly string[]
  setFrame(slot: 'first' | 'last', url: string | null): void
  addVideo(url: string): void
  removeVideo(url: string): void
  /** 本地图片文件 → R2 URL → 落进那个帧槽。⚠ 与参考图那条是同一条上传管线。 */
  uploadFrameFile(slot: 'first' | 'last', file: File): Promise<void>
  isUploading: boolean
}

export function useVideoReferenceSlots(
  selectedModel: { modelId: string; adapterType?: string } | null | undefined,
): UseVideoReferenceSlotsReturn {
  const { state, dispatch } = useStudioForm()
  // ⚠ 与 `use-image-upload` 同一个命名空间：压缩闸 / 上限 / 上传失败这几句话说的
  //    是同一件事，两个命名空间各写一份必然分叉。
  const t = useTranslations('ImageUpload')
  const tErrors = useTranslations('Errors')
  const [isUploading, setIsUploading] = useState(false)

  const visible = useMemo(
    () =>
      getVideoWorkbenchSlots(
        selectedModel?.modelId,
        selectedModel?.adapterType as AI_ADAPTER_TYPES | undefined,
      ),
    [selectedModel?.modelId, selectedModel?.adapterType],
  )

  const setFrame = useCallback(
    (slot: 'first' | 'last', url: string | null) => {
      dispatch({ type: 'SET_VIDEO_FRAME_SLOT', payload: { slot, url } })
    },
    [dispatch],
  )

  const videos = state.videoReferenceVideos

  const addVideo = useCallback(
    (url: string) => {
      if (videos.includes(url)) return
      // ⚠ 上限在这里夹一次是为了**说得出话**（toast），发送口那边还会再夹一次
      //   —— 残留值来自「切模型」，那是另一条路径。
      if (visible.videos > 0 && videos.length >= visible.videos) {
        toast.error(t('limitReached', { max: visible.videos }))
        return
      }
      dispatch({
        type: 'SET_VIDEO_REFERENCE_VIDEOS',
        payload: [...videos, url],
      })
    },
    [dispatch, t, videos, visible.videos],
  )

  const removeVideo = useCallback(
    (url: string) => {
      if (!videos.includes(url)) return
      dispatch({
        type: 'SET_VIDEO_REFERENCE_VIDEOS',
        payload: videos.filter((entry) => entry !== url),
      })
    },
    [dispatch, videos],
  )

  /**
   * ⚠ **绝不是 base64 data URL**：整张图进 JSON body 会把请求顶到 Vercel 的
   * 4.5MB 硬上限，平台层直接 413（`ReferenceImageChip` 里那段头注记的就是这次）。
   * 走的是与参考图逐字同源的那条：压缩闸 → multipart → R2 URL。
   */
  const uploadFrameFile = useCallback(
    async (slot: 'first' | 'last', file: File) => {
      if (!file.type.startsWith('image/')) return
      setIsUploading(true)
      try {
        const maxMb = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)
        const prepared = await prepareImageUpload(file, {
          maxBytes: CLIENT_UPLOAD_MAX_BYTES,
          messages: {
            compressing: t('compressing'),
            compressed: ({ from, to }) => t('compressed', { from, to }),
            gifTooLarge: t('gifTooLarge', { maxMb }),
            tooLarge: t('tooLarge', { maxMb }),
          },
        })
        // `prepareImageUpload` 拒了的时候已经自己 toast 过原因了 —— ⛔ 不再补一条。
        if (!prepared) return
        const response = await uploadImageFileAPI(prepared)
        if (response.success && response.data?.generation.url) {
          setFrame(slot, response.data.generation.url)
        } else {
          toast.error(getApiErrorMessage(tErrors, response, t('uploadFailed')))
        }
      } catch {
        toast.error(t('uploadFailed'))
      } finally {
        setIsUploading(false)
      }
    },
    [setFrame, t, tErrors],
  )

  return {
    visible,
    first: state.videoFrameSlots.first,
    last: state.videoFrameSlots.last,
    videos,
    setFrame,
    addVideo,
    removeVideo,
    uploadFrameFile,
    isUploading,
  }
}
