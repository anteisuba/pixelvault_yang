'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { uploadReferenceVideoAPI } from '@/lib/api-client'
import { captureVideoThumbnail } from '@/lib/video-thumbnail'

export interface ReferenceVideoUploadPatch {
  mediaUrl: string
  mediaLabel: string
  videoThumbnailUrl?: string
  sizeBytes: number
}

interface UseReferenceVideoUploadValue {
  uploadFile(file: File): Promise<ReferenceVideoUploadPatch | null>
  isUploading: boolean
}

/**
 * Shared 参考视频上传/替换通道: capture a poster frame → upload —
 * byte-identical to what `VideoReferenceInspector`'s detail-panel form always
 * did (that component now calls this hook too instead of keeping its own
 * copy). No client-side duration cap (owner call: fal's downstream per-clip
 * limit still applies but isn't pre-validated here). Returns the node-data
 * patch on success, or `null` after showing a toast (caller doesn't need its
 * own error handling). Doesn't call `updateNodeData` itself — callers apply
 * the patch (plus whatever `status` they want) so this stays a pure upload
 * primitive, not tied to one node.
 */
export function useReferenceVideoUpload(): UseReferenceVideoUploadValue {
  const t = useTranslations('StudioNode.videoReference')
  const [isUploading, setIsUploading] = useState(false)

  const uploadFile = useCallback(
    async (file: File): Promise<ReferenceVideoUploadPatch | null> => {
      setIsUploading(true)
      try {
        // Best-effort poster capture — a null thumbnail just means no poster,
        // never a failed upload (mirrors the AI-generated path's §9.2 cover).
        const thumbnailBlob = await captureVideoThumbnail(file)
        const response = await uploadReferenceVideoAPI(file, thumbnailBlob)
        if (!response.success || !response.data) {
          toast.error(response.error ?? t('errors.uploadFailed'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
          return null
        }

        toast.success(t('uploaded'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return {
          mediaUrl: response.data.url,
          mediaLabel: response.data.fileName,
          videoThumbnailUrl: response.data.thumbnailUrl,
          sizeBytes: response.data.sizeBytes,
        }
      } finally {
        setIsUploading(false)
      }
    },
    [t],
  )

  return { uploadFile, isUploading }
}
