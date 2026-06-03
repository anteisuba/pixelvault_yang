'use client'

import { useCallback, useState } from 'react'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { uploadImageAPI } from '@/lib/api-client'
import { compressImageToLimit } from '@/lib/compress-image'

const NODE_REFERENCE_UPLOAD_FALLBACK_ERROR = 'Reference image upload failed'

interface NodeReferenceUploadResult {
  success: boolean
  url?: string
  generationId?: string
  error?: string
}

interface UseNodeReferenceUploadValue {
  uploadFile(file: File, note: string): Promise<NodeReferenceUploadResult>
  isUploading: boolean
  error: string | null
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error(NODE_REFERENCE_UPLOAD_FALLBACK_ERROR))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function useNodeReferenceUpload(): UseNodeReferenceUploadValue {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(
    async (file: File, note: string): Promise<NodeReferenceUploadResult> => {
      setIsUploading(true)
      setError(null)

      try {
        // Compress under the Vercel request-body cap before base64-encoding —
        // an oversized data URL 413s at the platform before reaching the API.
        const { file: compressed } = await compressImageToLimit(file, {
          maxBytes: CLIENT_UPLOAD_MAX_BYTES,
        })
        const imageDataUrl = await readFileAsDataUrl(compressed)
        const response = await uploadImageAPI({
          imageDataUrl,
          note,
        })

        if (response.success && response.data?.generation.url) {
          return {
            success: true,
            url: response.data.generation.url,
            generationId: response.data.generation.id,
          }
        }

        const message = response.error ?? NODE_REFERENCE_UPLOAD_FALLBACK_ERROR
        setError(message)
        return { success: false, error: message }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : NODE_REFERENCE_UPLOAD_FALLBACK_ERROR
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsUploading(false)
      }
    },
    [],
  )

  return {
    uploadFile,
    isUploading,
    error,
  }
}
