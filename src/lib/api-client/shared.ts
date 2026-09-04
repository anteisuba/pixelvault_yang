import { API_ENDPOINTS } from '@/constants/config'

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

/**
 * Hand a presigned R2 URL to the browser. The `download` attribute is inert
 * cross-origin, but the signed URL carries
 * `response-content-disposition: attachment`, so the navigation resolves to a
 * download and the page stays put.
 */
function triggerDirectDownload(downloadUrl: string) {
  window.location.assign(downloadUrl)
}

interface DirectDownloadEnvelope {
  data?: { downloadUrl?: string }
}

/**
 * Download one asset through the auth-gated `/api/download` endpoint.
 *
 * For our own R2 objects the endpoint answers with JSON carrying a presigned
 * URL and the bytes flow browser → R2 directly. Provider CDN assets (fal /
 * replicate) still come back as a proxied stream, which we materialise into a
 * blob so the `download` attribute can name the file.
 */
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
    const response = await fetch(
      `${API_ENDPOINTS.DOWNLOAD}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`,
    )

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

    if (
      response.headers.get('content-type')?.includes('application/json') ===
      true
    ) {
      const envelope = (await response.json()) as DirectDownloadEnvelope
      const downloadUrl = envelope.data?.downloadUrl
      if (!downloadUrl) {
        return { success: false, error: 'Download URL missing in response' }
      }
      triggerDirectDownload(downloadUrl)
      return { success: true }
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
