interface ApiErrorPayload {
  error?: string
  errorCode?: string
  i18nKey?: string
}

export async function getErrorPayload(
  response: Response,
  fallbackMessage: string,
): Promise<{ error: string; errorCode?: string; i18nKey?: string }> {
  const errorData = (await response
    .json()
    .catch(() => null)) as ApiErrorPayload | null

  return {
    error: errorData?.error ?? fallbackMessage,
    errorCode: errorData?.errorCode,
    i18nKey: errorData?.i18nKey,
  }
}

export async function getErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const payload = await getErrorPayload(response, fallbackMessage)
  return payload.error
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(blobUrl)
}

export async function downloadRemoteAsset(
  url: string,
  fileName: string,
): Promise<{
  success: boolean
  error?: string
  errorCode?: string
  i18nKey?: string
}> {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Download failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    const blob = await response.blob()
    triggerBlobDownload(blob, fileName)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
