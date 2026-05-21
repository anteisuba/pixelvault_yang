/**
 * Shared glue between `compressImageToLimit` and the toast/banner UX every
 * upload entry point in the app needs to play.
 *
 * Extracted from Studio3DWorkspace so the cascade of "loading toast → try
 * compress → either success-message or error" can be unit-tested without
 * mounting a 1800-line component. Each call site supplies its own i18n
 * strings because the keys differ per workspace (Model3DGenerate uses
 * `errorGifTooLarge`, AssetsPage uses `uploadGifTooLarge`, etc.).
 *
 * Returns the file that should be uploaded — either the original (small
 * enough) or a compressed version — or `null` when the file cannot be
 * shrunk under the cap. On null, an error toast has already been shown
 * and the caller should bail out.
 */

'use client'

import { toast } from 'sonner'

import {
  compressImageToLimit,
  ImageCompressionError,
} from '@/lib/compress-image'

export interface PrepareImageUploadMessages {
  /** Shown via `toast.loading` while compressImageToLimit is running. */
  compressing: string
  /**
   * Built lazily so the caller can plug `from` / `to` MB strings into its
   * own translated template (e.g. `t('uploadCompressed', { from, to })`).
   */
  compressed: (vars: { from: string; to: string }) => string
  /** Shown via `toast.error` when the file is an animated GIF. */
  gifTooLarge: string
  /** Shown via `toast.error` for every other compression failure. */
  tooLarge: string
}

export interface PrepareImageUploadOptions {
  maxBytes: number
  messages: PrepareImageUploadMessages
  /**
   * Called with the same error message that was toasted, so callers that
   * also show a persistent banner (e.g. ImageEditProvider's `bannerError`)
   * stay in sync. Optional.
   */
  onError?: (message: string) => void
}

export async function prepareImageUpload(
  file: File,
  options: PrepareImageUploadOptions,
): Promise<File | null> {
  if (file.size <= options.maxBytes) return file

  const loadingId = toast.loading(options.messages.compressing)
  try {
    const result = await compressImageToLimit(file, {
      maxBytes: options.maxBytes,
    })
    toast.dismiss(loadingId)
    if (result.wasCompressed) {
      toast.message(
        options.messages.compressed({
          from: (result.originalBytes / 1024 / 1024).toFixed(1),
          to: (result.compressedBytes / 1024 / 1024).toFixed(1),
        }),
      )
    }
    return result.file
  } catch (err) {
    toast.dismiss(loadingId)
    const message =
      err instanceof ImageCompressionError && err.code === 'UNSUPPORTED_FORMAT'
        ? options.messages.gifTooLarge
        : options.messages.tooLarge
    toast.error(message)
    options.onError?.(message)
    return null
  }
}
