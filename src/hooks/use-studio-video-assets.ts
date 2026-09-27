'use client'

/**
 * 视频工作台的**素材**（owner 2026-09-24 视频画板：去掉三个模式，按挂了什么判断；
 * 09-27 视频台 A：素材挂在输入框里，「＋」是工具行的「素材」chip，拖放落点是整个输入框）。
 *
 * ⭐ 三条落法**汇到同一处写入**：拖入 / 素材库选择 / 助手 `mount_reference slot`。
 * 前两条走这颗 hook，第三条走宿主（`use-studio-workbench-operator-host.ts` 的
 * `addReference(url, slot)`）—— 两边写的是**同一份状态**（首尾帧 `SET_VIDEO_FRAME_SLOT`、
 * 参考图 `imageUpload`、参考视频 `SET_VIDEO_REFERENCE_VIDEOS`），所以撤销、快照、
 * 发送口只认识一份真相。⛔ 别在组件里另写一条写入。
 *
 * ⭐ 图片的**角色**（首帧 / 尾帧 / 参考）是角标，不是另一条轨：进来时按型号能力定
 * 一个默认，点一下改。编号、容量、这一枪怎么发全部来自 `lib/studio/video-workbench-slots`。
 */

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { parseDroppedAssetIds } from '@/hooks/use-studio-operator-mention'
import { getOperatorReviewState } from '@/hooks/use-studio-operator-store'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { uploadImageFileAPI } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import {
  getStudioVideoCapacity,
  listStudioVideoImages,
  resolveStudioVideoSend,
  type StudioVideoCapacity,
  type StudioVideoImage,
  type StudioVideoImageRole,
  type StudioVideoSend,
} from '@/lib/studio/video-workbench-slots'
import type { GenerationRecord } from '@/types'

export interface UseStudioVideoAssetsReturn {
  capacity: StudioVideoCapacity
  /** 轨上的图（首帧、尾帧、参考图同一序列编号）。 */
  images: readonly StudioVideoImage[]
  videos: readonly string[]
  /** 这一枪怎么发；还没选模型时为 `null`。 */
  send: StudioVideoSend | null
  /** 这张图还能改成哪些角色（按型号能力，⛔ 不给点了没用的选项）。 */
  rolesFor(image: StudioVideoImage): StudioVideoImageRole[]
  /** 进来一张图：型号有参考档 → 参考；否则依次填首帧、尾帧。 */
  addImage(url: string): void
  setRole(url: string, role: StudioVideoImageRole): void
  removeImage(url: string): void
  /** 本地图片文件 → R2 URL → `addImage`。⚠ 与参考图同一条上传管线。 */
  uploadImageFile(file: File): Promise<void>
  addVideo(url: string): void
  removeVideo(url: string): void
  /** 这个型号收不收图（首尾帧或参考，有一样就收）。 */
  acceptsImages: boolean
  /**
   * 拖进输入框的东西（本地图、画廊 / 素材库格子）—— 与「素材」菜单同一个入口；
   * 「已否」的产物拒收，而且要说话。
   */
  acceptTransfer(data: DataTransfer): void
  /** 素材库挑中的一条：`image` 按型号能力落首帧 / 尾帧 / 参考，`video` 进参考视频。 */
  acceptGeneration(generation: GenerationRecord, kind: 'image' | 'video'): void
  isUploading: boolean
}

export function useStudioVideoAssets(): UseStudioVideoAssetsReturn {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')
  // ⚠ 与 `use-image-upload` 同一个命名空间：压缩闸 / 上限 / 上传失败说的是同一件事。
  const t = useTranslations('ImageUpload')
  const tErrors = useTranslations('Errors')
  /** 拒收那一句住在助手的 `reject` 档里 —— 它说的是「助手 / 审核为什么不收」。 */
  const tOperator = useTranslations('StudioOperator')
  const [isUploading, setIsUploading] = useState(false)

  const adapterType = selectedModel?.adapterType as AI_ADAPTER_TYPES | undefined
  const capacity = useMemo(
    () => getStudioVideoCapacity(selectedModel?.modelId, adapterType),
    [selectedModel?.modelId, adapterType],
  )

  const { first, last } = state.videoFrameSlots
  const references = imageUpload.referenceImages
  const videos = state.videoReferenceVideos
  const audios = state.videoAudioRefs.length

  const images = useMemo(
    () => listStudioVideoImages({ first, last, references }),
    [first, last, references],
  )

  const send = useMemo(
    () =>
      selectedModel
        ? resolveStudioVideoSend(selectedModel.modelId, adapterType, {
            first,
            last,
            references,
            videos,
            audios,
          })
        : null,
    [selectedModel, adapterType, first, last, references, videos, audios],
  )

  const setFrame = useCallback(
    (slot: 'first' | 'last', url: string | null) => {
      dispatch({ type: 'SET_VIDEO_FRAME_SLOT', payload: { slot, url } })
    },
    [dispatch],
  )

  const acceptsReferences = capacity.references !== 0

  const rolesFor = useCallback(
    (image: StudioVideoImage): StudioVideoImageRole[] => {
      const roles: StudioVideoImageRole[] = []
      if (capacity.frames >= 1) roles.push('first')
      if (capacity.frames === 2) roles.push('last')
      if (acceptsReferences) roles.push('reference')
      return roles.filter((role) => role !== image.role)
    },
    [capacity.frames, acceptsReferences],
  )

  const addImage = useCallback(
    (url: string) => {
      if (!url || images.some((image) => image.url === url)) return
      if (acceptsReferences) {
        void imageUpload.addFromUrl(url)
        return
      }
      if (capacity.frames >= 1 && !first) {
        setFrame('first', url)
        return
      }
      if (capacity.frames === 2 && !last) {
        setFrame('last', url)
        return
      }
      toast.error(t('limitReached', { max: capacity.frames }))
    },
    [
      acceptsReferences,
      capacity.frames,
      first,
      last,
      images,
      imageUpload,
      setFrame,
      t,
    ],
  )

  const removeImage = useCallback(
    (url: string) => {
      if (first === url) setFrame('first', null)
      else if (last === url) setFrame('last', null)
      else {
        const index = references.indexOf(url)
        if (index >= 0) imageUpload.removeReferenceImage(index)
      }
    },
    [first, last, references, imageUpload, setFrame],
  )

  /**
   * 改角色 = 从原处拿下 → 放到新处。新处已被另一张占着时，那一张退回参考
   * （型号没有参考档时就只是被替换）——⛔ 不让两张图同时是首帧。
   */
  const setRole = useCallback(
    (url: string, role: StudioVideoImageRole) => {
      const current = images.find((image) => image.url === url)
      if (!current || current.role === role) return
      removeImage(url)
      if (role === 'reference') {
        void imageUpload.addFromUrl(url)
        return
      }
      const occupant = role === 'first' ? first : last
      if (occupant && occupant !== url && acceptsReferences) {
        void imageUpload.addFromUrl(occupant)
      }
      setFrame(role, url)
    },
    [
      images,
      removeImage,
      imageUpload,
      first,
      last,
      acceptsReferences,
      setFrame,
    ],
  )

  /**
   * ⚠ **绝不是 base64 data URL**：整张图进 JSON body 会把请求顶到 Vercel 的
   * 4.5MB 硬上限，平台层直接 413。走与参考图逐字同源的那条：压缩闸 → multipart → R2 URL。
   */
  const uploadImageFile = useCallback(
    async (file: File) => {
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
          addImage(response.data.generation.url)
        } else {
          toast.error(getApiErrorMessage(tErrors, response, t('uploadFailed')))
        }
      } catch {
        toast.error(t('uploadFailed'))
      } finally {
        setIsUploading(false)
      }
    },
    [addImage, t, tErrors],
  )

  const addVideo = useCallback(
    (url: string) => {
      if (videos.includes(url)) return
      // ⚠ 上限在这里夹一次是为了**说得出话**（toast），发送口那边还会再夹一次
      //   —— 残留值来自「切模型」，那是另一条路径。
      if (videos.length >= capacity.videos) {
        toast.error(t('limitReached', { max: capacity.videos }))
        return
      }
      dispatch({
        type: 'SET_VIDEO_REFERENCE_VIDEOS',
        payload: [...videos, url],
      })
    },
    [dispatch, t, videos, capacity.videos],
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

  const acceptsImages = capacity.frames > 0 || acceptsReferences

  /**
   * ⭐ **拒收「已否」的产物**（切片 Y）—— 客户端先拒，⛔ 不等服务端：标 blocked 说的
   * 正是「这张不能再开头也不能收尾」。拒的时候**要说话**（toast）。
   */
  const allowSource = useCallback(
    (assetIds: readonly string[]) => {
      const blocked = assetIds.some(
        (id) =>
          getOperatorReviewState(id) === GENERATION_REVIEW_STATE_IDS.blocked,
      )
      if (blocked) toast.error(tOperator('reject.blockedSource'))
      return !blocked
    },
    [tOperator],
  )

  /**
   * ⚠ 原生 drop：要同时接**本地文件**与画廊格子拖过来的那条 URL —— 画廊格子拖动时
   *   同时写了 `text/uri-list`，两边都接得住。
   */
  const acceptTransfer = useCallback(
    (data: DataTransfer) => {
      if (!acceptsImages) return
      const assetIds = parseDroppedAssetIds(data.getData(ASSET_DND_MIME))
      if (assetIds.length > 0 && !allowSource(assetIds)) return
      const files = Array.from(data.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      )
      if (files.length > 0) {
        // 一张一张传：编号跟着松手时的顺序走。
        void (async () => {
          for (const file of files) await uploadImageFile(file)
        })()
        return
      }
      const url = data.getData('text/uri-list') || data.getData('text/plain')
      if (url && /^https?:\/\//.test(url)) addImage(url)
    },
    [acceptsImages, allowSource, uploadImageFile, addImage],
  )

  const acceptGeneration = useCallback(
    (generation: GenerationRecord, kind: 'image' | 'video') => {
      if (kind === 'video') {
        if (generation.outputType === 'VIDEO') addVideo(generation.url)
        return
      }
      if (generation.outputType !== 'IMAGE') return
      // ⭐ 素材库那条路与拖入同一道闸。
      if (!allowSource([generation.id])) return
      addImage(generation.url)
    },
    [addImage, addVideo, allowSource],
  )

  return {
    capacity,
    images,
    videos,
    send,
    rolesFor,
    addImage,
    setRole,
    removeImage,
    uploadImageFile,
    addVideo,
    removeVideo,
    acceptsImages,
    acceptTransfer,
    acceptGeneration,
    isUploading: isUploading || imageUpload.isUploading,
  }
}
