'use client'

import { useState, useCallback, useRef, useMemo } from 'react'

import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { uploadImageFileAPI } from '@/lib/api-client'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import { useStableDragState } from '@/hooks/use-stable-drag-state'

/**
 * One reference image in the upload store.
 *
 * - `disabledReason: null` → currently usable; included in `referenceImages`
 *   and sent to generation.
 * - `disabledReason: 'over_limit'` → the active model accepts reference
 *   images, but this entry sits beyond the model's max. Kept in state so
 *   switching back to a higher-capacity model restores it as enabled.
 * - `disabledReason: 'unsupported'` → the active model takes no reference
 *   images at all. Same preservation contract.
 *
 * Both disabled states are surfaced via `referenceEntries` for the UI to
 * render greyed-out thumbnails — generation code only ever sees the enabled
 * urls through `referenceImages` / `referenceImage`.
 */
export interface ReferenceImageEntry {
  url: string
  disabledReason: 'over_limit' | 'unsupported' | null
}

interface UseImageUploadReturn {
  /** First enabled reference image (back-compat for single-image adapters) */
  referenceImage: string | undefined
  setReferenceImage: (image: string | undefined) => void
  /** All enabled reference image urls (multi-image adapters) */
  referenceImages: string[]
  /** Full state including disabled entries — for UI rendering only. */
  referenceEntries: ReadonlyArray<ReferenceImageEntry>
  addReferenceImage: (image: string) => void
  /**
   * Remove an entry by its index in `referenceEntries`. The UI iterates that
   * list directly so its `idx` lines up here; callers that only have
   * `referenceImages` would need to translate first.
   */
  removeReferenceImage: (index: number) => void
  clearAllImages: () => void
  /**
   * Add a reference image from an http(s) URL. Stores the URL as-is — the
   * server-side LLM/provider pipeline handles both `data:` and `http(s)`
   * inputs, so we no longer fetch + base64 the asset on the client.
   */
  addFromUrl: (url: string) => Promise<void>
  /**
   * Update the active model's reference-image capacity.
   * - `max <= 0` → all entries flip to `unsupported`.
   * - `max > 0` → first `max` entries stay enabled, rest become `over_limit`.
   *
   * No entry is ever removed: state is rebuilt by toggling `disabledReason`
   * so switching back to a higher-capacity model restores them automatically.
   */
  setMaxImages: (max: number) => void
  isDragging: boolean
  setIsDragging: (dragging: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleFileChange: (file: File) => Promise<void>
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => Promise<void>
  handleDragEnter: (e: React.DragEvent<Element>) => void
  handleDragOver: (e: React.DragEvent<Element>) => void
  handleDragLeave: (e: React.DragEvent<Element>) => void
  openFilePicker: () => void
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  clearImage: () => void
  /** True while a local file is being compressed + uploaded to R2. */
  isUploading: boolean
}

function computeDisabledReason(
  idx: number,
  max: number,
): ReferenceImageEntry['disabledReason'] {
  if (max <= 0) return 'unsupported'
  if (idx >= max) return 'over_limit'
  return null
}

/**
 * Shared hook for image upload via file picker or drag-and-drop.
 *
 * Internally stores `ReferenceImageEntry[]` so we can preserve images across
 * model switches and just toggle a `disabledReason` flag. Externally the
 * legacy `referenceImages: string[]` getter still exists for downstream
 * generation code — it's now derived (enabled entries only).
 */
export function useImageUpload(): UseImageUploadReturn {
  const [referenceEntries, setReferenceEntries] = useState<
    ReferenceImageEntry[]
  >([])
  const {
    isDragging,
    setDragging,
    resetDragging,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
  } = useStableDragState()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // "Unlimited until configured" — protects first-mount additions from
  // getting auto-disabled before StudioDockPanelArea runs its effect.
  const maxImagesRef = useRef<number>(Infinity)
  const [isUploading, setIsUploading] = useState(false)
  const t = useTranslations('ImageUpload')

  const referenceImages = useMemo(
    () =>
      referenceEntries
        .filter((entry) => entry.disabledReason === null)
        .map((entry) => entry.url),
    [referenceEntries],
  )
  const referenceImage = referenceImages[0] as string | undefined

  const setMaxImages = useCallback((max: number) => {
    maxImagesRef.current = max
    setReferenceEntries((prev) => {
      const recomputed = prev.map((entry, idx) => {
        const reason = computeDisabledReason(idx, max)
        return entry.disabledReason === reason
          ? entry
          : { ...entry, disabledReason: reason }
      })
      // Bail out when no entry's reason actually changed — avoids a re-render
      // cascade through the studio dock on every unrelated state change.
      const changed = recomputed.some((entry, idx) => entry !== prev[idx])
      return changed ? recomputed : prev
    })
  }, [])

  const addReferenceImage = useCallback((image: string) => {
    setReferenceEntries((prev) => {
      const max = maxImagesRef.current
      if (max === 1) {
        return [{ url: image, disabledReason: null }]
      }
      const newIdx = prev.length
      return [
        ...prev,
        {
          url: image,
          disabledReason: computeDisabledReason(newIdx, max),
        },
      ]
    })
  }, [])

  const removeReferenceImage = useCallback((index: number) => {
    setReferenceEntries((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const next = prev.filter((_, i) => i !== index)
      // Indexes shift after removal — recompute so a previously over_limit
      // entry can graduate to enabled.
      const max = maxImagesRef.current
      return next.map((entry, idx) => {
        const reason = computeDisabledReason(idx, max)
        return entry.disabledReason === reason
          ? entry
          : { ...entry, disabledReason: reason }
      })
    })
  }, [])

  const addFromUrl = useCallback(
    async (url: string) => {
      // Pass-through: keep the http(s) URL. Previously we downloaded the
      // asset and re-encoded it as a PNG data URL, which dominated the
      // "use as reference" interaction time and bloated request payloads.
      // The server already normalizes both forms, so the client doesn't
      // need to materialize the bytes anymore.
      if (!url) return
      addReferenceImage(url)
    },
    [addReferenceImage],
  )

  const clearAllImages = useCallback(() => {
    setReferenceEntries([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Legacy setter — replaces all entries with a single one (or clears).
  const setReferenceImage = useCallback((image: string | undefined) => {
    if (!image) {
      setReferenceEntries([])
      return
    }
    setReferenceEntries([
      {
        url: image,
        disabledReason: computeDisabledReason(0, maxImagesRef.current),
      },
    ])
  }, [])

  // Local files upload via multipart/form-data (raw bytes, no base64) and come
  // back as an http(s) R2 URL — never inlined as a multi-MB data URL in a
  // generate request body. prepareImageUpload only squeezes files over the cap,
  // so normal images keep full quality. Mirrors the node-editor / image-edit
  // upload path.
  const uploadLocalFile = useCallback(
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
        if (!prepared) return // prepareImageUpload already toasted the reason
        const response = await uploadImageFileAPI(prepared)
        if (response.success && response.data?.generation.url) {
          addReferenceImage(response.data.generation.url)
        } else {
          toast.error(response.error ?? t('uploadFailed'))
        }
      } catch {
        toast.error(t('uploadFailed'))
      } finally {
        setIsUploading(false)
      }
    },
    [t, addReferenceImage],
  )

  const handleFileChange = useCallback(
    async (file: File) => {
      await uploadLocalFile(file)
    },
    [uploadLocalFile],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      resetDragging()

      // Handle studio gallery image drops (drag from gallery → reference)
      if (e.dataTransfer.types.includes('application/x-studio-ref')) {
        const studioRef = e.dataTransfer.getData('application/x-studio-ref')
        if (studioRef) {
          try {
            const { url } = JSON.parse(studioRef) as { url: string }
            if (url) await addFromUrl(url)
          } catch {
            // Ignore invalid data
          }
        }
        return
      }

      // Support dropping multiple local files
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      )
      for (const file of files) {
        await uploadLocalFile(file)
      }
    },
    [uploadLocalFile, addFromUrl, resetDragging],
  )

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      for (const file of Array.from(files)) {
        await uploadLocalFile(file)
      }
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [uploadLocalFile],
  )

  // Legacy clear — clears all images
  const clearImage = clearAllImages

  return {
    referenceImage,
    setReferenceImage,
    referenceImages,
    referenceEntries,
    addReferenceImage,
    removeReferenceImage,
    clearAllImages,
    addFromUrl,
    setMaxImages,
    isDragging,
    setIsDragging: setDragging,
    fileInputRef,
    handleFileChange,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleInputChange,
    clearImage,
    isUploading,
  }
}
