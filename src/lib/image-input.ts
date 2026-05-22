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
