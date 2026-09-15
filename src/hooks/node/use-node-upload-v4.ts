'use client'

/**
 * v4 的**上传回填链**（第三期 · 画布 C3c-②Q · 盘点 §5「上传路由的 patch 落到
 * v4 版本条目」）。
 *
 * 三种素材、三条已有路由，回填的却是**同一组字段**（`NodeV4MediaPatch` =
 * `NodeV4MediaMetaShape`）。v3 时代每个卡各写一份 patch 装配：散图卡写
 * `mediaUrl`、参考视频卡写 `mediaUrl + videoThumbnailUrl + sizeBytes`、音色卡写
 * `voiceReferenceAudioUrl` —— 于是「上传成功了但卡上没变」在三处各修过一次。
 * 这里收成一个：**路由不同、patch 同形**。
 *
 * ⚠ 回填**不发 op**：助手不许塞 URL（op 表 §5 纪律 1），用户自己传上来的那一份
 * 走 `NodeV4Context.onSetMedia`。所以这个钩子只**产出 patch**，落哪个节点由调用方
 * 决定 —— 它不知道也不需要知道节点 id。
 *
 * ⚠ 失败态带**重试同一个 File**（盘点 §1 `ImageSourceStarter` / `LooseImageCard`
 * 的硬要求）：`lastFile` 留在钩子里，UI 只要在错误分支上摆一颗「重试」。
 */

import { useCallback, useRef, useState } from 'react'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import { uploadImageFileAPI, uploadReferenceVideoAPI } from '@/lib/api-client'
import { uploadReferenceAudioAPI } from '@/lib/api-client/voices'
import { compressImageToLimit, readImagePixelSize } from '@/lib/compress-image'
import { notifyGalleryChanged } from '@/lib/gallery-revision'
import { captureVideoThumbnail } from '@/lib/video-thumbnail'
import type { NodeV4MediaPatch } from '@/components/business/node/nodes/v4/NodeV4Context'

export const NODE_V4_UPLOAD_KINDS = ['image', 'audio', 'video'] as const

export type NodeV4UploadKind = (typeof NODE_V4_UPLOAD_KINDS)[number]

export interface UseNodeUploadV4Value {
  /** 传一个文件，成功返回可直接交给 `onSetMedia` 的 patch，失败返回 `null`。 */
  upload(
    kind: NodeV4UploadKind,
    file: File,
    note: string,
  ): Promise<NodeV4MediaPatch | null>
  /** 重放上一次失败的那一个 File（同一个文件、同一个 kind）。 */
  retry(): Promise<NodeV4MediaPatch | null>
  readonly isUploading: boolean
  /** 0–100 真实字节进度（只有图片路由报得出来，其余两条停在 0）。 */
  readonly progress: number
  readonly error: string | null
  /** 有没有可重试的那一份 —— UI 据此决定要不要摆「重试」。 */
  readonly canRetry: boolean
  cancel(): void
}

export function useNodeUploadV4(): UseNodeUploadV4Value {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const lastRef = useRef<{
    kind: NodeV4UploadKind
    file: File
    note: string
  } | null>(null)

  const upload = useCallback(
    async (
      kind: NodeV4UploadKind,
      file: File,
      note: string,
    ): Promise<NodeV4MediaPatch | null> => {
      lastRef.current = { kind, file, note }
      setIsUploading(true)
      setProgress(0)
      setError(null)
      setCanRetry(false)
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        if (kind === 'image') {
          // 超过上限的才压，小图原样上传（与 `useNodeReferenceUpload` 同一条）。
          const { file: compressed } = await compressImageToLimit(file, {
            maxBytes: CLIENT_UPLOAD_MAX_BYTES,
          })
          const pixels = await readImagePixelSize(compressed)
          const response = await uploadImageFileAPI(compressed, {
            note,
            onProgress: setProgress,
            signal: controller.signal,
          })
          const url = response.data?.generation.url
          if (!response.success || !url) {
            setError(response.error ?? 'upload failed')
            setCanRetry(true)
            return null
          }
          // 传上去的这一份**也是一件产物**（服务端建了 Generation），素材库与
          // 历史两个面板据此重拉 —— ⛔ 不让用户自己去点刷新（owner 2026-09-12）。
          notifyGalleryChanged()
          return {
            url,
            sizeBytes: compressed.size,
            imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
            ...(pixels
              ? { mediaWidth: pixels.width, mediaHeight: pixels.height }
              : {}),
          }
        }

        if (kind === 'audio') {
          const response = await uploadReferenceAudioAPI(file)
          if (!response.success || !response.data) {
            setError(response.error ?? 'upload failed')
            setCanRetry(true)
            return null
          }
          notifyGalleryChanged()
          return {
            url: response.data.url,
            sizeBytes: response.data.sizeBytes,
          }
        }

        // 视频：先在客户端抓一帧当 poster —— 抓不到只是没封面，⛔ 不算上传失败
        // （与 AI 生成那条路的 §9.2 封面同一条规矩）。
        const thumbnailBlob = await captureVideoThumbnail(file)
        const response = await uploadReferenceVideoAPI(file, thumbnailBlob)
        if (!response.success || !response.data) {
          setError(response.error ?? 'upload failed')
          setCanRetry(true)
          return null
        }
        notifyGalleryChanged()
        return {
          url: response.data.url,
          sizeBytes: response.data.sizeBytes,
          ...(response.data.thumbnailUrl
            ? { videoThumbnailUrl: response.data.thumbnailUrl }
            : {}),
        }
      } catch (cause) {
        if (controller.signal.aborted) {
          // 用户自己按的取消 —— 静默回到空态，⛔ 不当失败报（S4 2026-07-27）。
          setError(null)
          setCanRetry(false)
          return null
        }
        setError(cause instanceof Error ? cause.message : String(cause))
        setCanRetry(true)
        return null
      } finally {
        setIsUploading(false)
        controllerRef.current = null
      }
    },
    [],
  )

  const retry = useCallback(async (): Promise<NodeV4MediaPatch | null> => {
    const last = lastRef.current
    if (!last) return null
    return upload(last.kind, last.file, last.note)
  }, [upload])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  return { upload, retry, isUploading, progress, error, canRetry, cancel }
}
