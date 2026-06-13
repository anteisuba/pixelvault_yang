export function isRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function getImageFileFromDataTransfer(
  dataTransfer: DataTransfer,
): File | null {
  return (
    Array.from(dataTransfer.files).find((file) =>
      file.type.startsWith('image/'),
    ) ?? null
  )
}

export function getRemoteImageUrlFromDataTransfer(
  dataTransfer: DataTransfer,
): string | null {
  const pastedText = dataTransfer.getData('text').trim()
  return pastedText && isRemoteImageUrl(pastedText) ? pastedText : null
}

export interface ImageFileValidationOptions {
  /** Bytes — file is rejected with reason "size" when exceeded. Omit to skip. */
  maxFileSize?: number
  /** Px — file is rejected with reason "dimension" when either side exceeds. Omit to skip. */
  maxDimension?: number
  /** MIME types accepted; rejected with reason "type" otherwise. Omit to accept any image/*. */
  acceptedTypes?: readonly string[]
}

export type ImageFileResult =
  | { ok: true; base64: string }
  | { ok: false; reason: 'type' | 'size' | 'dimension' | 'read' }

/**
 * Read a user-selected image File as a data URL, optionally enforcing type,
 * size and dimension constraints. The dimension check requires loading the
 * image, so this is a Promise; callers that don't need it can omit
 * `maxDimension` to skip the extra round-trip.
 *
 * Returns a discriminated union so callers can map each failure mode to a
 * specific i18n string when they care, or collapse everything to a single
 * generic message when they don't.
 */
export function readImageFileAsBase64(
  file: File,
  options: ImageFileValidationOptions = {},
): Promise<ImageFileResult> {
  const { maxFileSize, maxDimension, acceptedTypes } = options

  if (acceptedTypes && !acceptedTypes.includes(file.type)) {
    return Promise.resolve({ ok: false, reason: 'type' })
  }
  if (!acceptedTypes && !file.type.startsWith('image/')) {
    return Promise.resolve({ ok: false, reason: 'type' })
  }
  if (maxFileSize !== undefined && file.size > maxFileSize) {
    return Promise.resolve({ ok: false, reason: 'size' })
  }

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ ok: false, reason: 'read' })
    reader.onload = (e) => {
      const base64 = e.target?.result
      if (typeof base64 !== 'string') {
        resolve({ ok: false, reason: 'read' })
        return
      }
      if (maxDimension === undefined) {
        resolve({ ok: true, base64 })
        return
      }
      const img = new Image()
      img.onload = () => {
        if (img.width > maxDimension || img.height > maxDimension) {
          resolve({ ok: false, reason: 'dimension' })
          return
        }
        resolve({ ok: true, base64 })
      }
      img.onerror = () => resolve({ ok: false, reason: 'read' })
      img.src = base64
    }
    reader.readAsDataURL(file)
  })
}
