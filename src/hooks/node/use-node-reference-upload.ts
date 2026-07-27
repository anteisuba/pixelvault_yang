'use client'

import { useCallback, useRef, useState } from 'react'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { uploadImageFileAPI } from '@/lib/api-client'
import { compressImageToLimit } from '@/lib/compress-image'

const NODE_REFERENCE_UPLOAD_FALLBACK_ERROR = 'Reference image upload failed'

interface NodeReferenceUploadResult {
  success: boolean
  url?: string
  generationId?: string
  error?: string
  /** S4（2026-07-27）: true when the caller itself cancelled via
   *  `cancelUpload()` — a deliberate action, not a failure. Callers should
   *  treat this as a silent reset (back to empty), not surface `error`. */
  cancelled?: boolean
}

interface UseNodeReferenceUploadValue {
  uploadFile(file: File, note: string): Promise<NodeReferenceUploadResult>
  isUploading: boolean
  /** 0–100, real byte-level progress (canvas-image-card.md §3 硬要求①：上传
   *  必须给真实百分比，不能沿用生成态的「无进度」)。 */
  progress: number
  error: string | null
  /** Aborts the in-flight R2 PUT — wired to the card's × cancel affordance. */
  cancelUpload(): void
}

export function useNodeReferenceUpload(): UseNodeReferenceUploadValue {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const uploadFile = useCallback(
    async (file: File, note: string): Promise<NodeReferenceUploadResult> => {
      setIsUploading(true)
      setProgress(0)
      setError(null)
      const controller = new AbortController()
      controllerRef.current = controller

      try {
        // Only squeeze files over the cap; smaller ones upload untouched at
        // full quality. Sent as multipart raw bytes, not a base64 data URL.
        const { file: compressed } = await compressImageToLimit(file, {
          maxBytes: CLIENT_UPLOAD_MAX_BYTES,
        })
        const response = await uploadImageFileAPI(compressed, {
          note,
          onProgress: setProgress,
          signal: controller.signal,
        })

        if (response.success && response.data?.generation.url) {
          return {
            success: true,
            url: response.data.generation.url,
            generationId: response.data.generation.id,
          }
        }

        if (controller.signal.aborted) {
          return { success: false, cancelled: true }
        }

        const message = response.error ?? NODE_REFERENCE_UPLOAD_FALLBACK_ERROR
        setError(message)
        return { success: false, error: message }
      } catch (caughtError) {
        if (controller.signal.aborted) {
          return { success: false, cancelled: true }
        }
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : NODE_REFERENCE_UPLOAD_FALLBACK_ERROR
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsUploading(false)
        controllerRef.current = null
      }
    },
    [],
  )

  const cancelUpload = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  return {
    uploadFile,
    isUploading,
    progress,
    error,
    cancelUpload,
  }
}
