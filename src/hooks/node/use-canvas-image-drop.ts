'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { uploadImageFileAPI } from '@/lib/api-client'
import { compressImageToLimit } from '@/lib/compress-image'

export interface CanvasImageDropResult {
  url: string
  name: string
}

interface UseCanvasImageDropValue {
  /** True while any file from the current drop is still uploading — callers
   *  show a toast.loading for this (§三.2 "上传中占位态"). */
  isUploading: boolean
  /** Uploads every image file in the list (non-image files are silently
   *  skipped — a mixed-type OS drag is common and shouldn't hard-fail the
   *  whole drop). Resolves with one entry per successful upload; a failed
   *  file toasts its own reason (reusing `errors.upload.*`) and is omitted
   *  from the result, matching `use-image-upload.ts`'s per-file semantics. */
  uploadFiles(files: File[]): Promise<CanvasImageDropResult[]>
}

/**
 * S5c 三.2 画布侧文件拖入接线: `use-image-upload.ts`'s own hook owns a
 * `referenceEntries[]` list model built for a generation form's reference
 * picker (disabled/over_limit bookkeeping, a `referenceImage` singular
 * getter, …) — none of which applies to "drop a file, get back a URL to put
 * on a new canvas node." This reuses the same underlying R2 upload primitive
 * `use-node-reference-upload.ts` already does (`compressImageToLimit` +
 * `uploadImageFileAPI`), just without that hook's per-file loading/error
 * state (a canvas drop uploads N files at once and needs one aggregate
 * "uploading" flag, not per-file — StudioNodeWorkbench does the per-node
 * placement once each URL comes back).
 */
export function useCanvasImageDrop(): UseCanvasImageDropValue {
  const [isUploading, setIsUploading] = useState(false)
  const t = useTranslations('StudioNode.ingest.looseImage')

  const uploadFiles = useCallback(
    async (files: File[]): Promise<CanvasImageDropResult[]> => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))
      if (imageFiles.length === 0) return []

      setIsUploading(true)
      const results: CanvasImageDropResult[] = []
      try {
        for (const file of imageFiles) {
          try {
            const { file: compressed } = await compressImageToLimit(file, {
              maxBytes: CLIENT_UPLOAD_MAX_BYTES,
            })
            const response = await uploadImageFileAPI(compressed, {
              note: 'Node canvas loose image drop',
            })
            if (response.success && response.data?.generation.url) {
              results.push({
                url: response.data.generation.url,
                name: file.name,
              })
            } else {
              toast.error(response.error ?? t('uploadFailed'))
            }
          } catch {
            toast.error(t('uploadFailed'))
          }
        }
      } finally {
        setIsUploading(false)
      }
      return results
    },
    [t],
  )

  return { isUploading, uploadFiles }
}
