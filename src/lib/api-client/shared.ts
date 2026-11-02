import { API_ENDPOINTS } from '@/constants/config'
import {
  AssistantOperatorMissingKeySchema,
  type AssistantOperatorMissingKey,
} from '@/types/assistant-operator'
import {
  TRANSPORT_ERROR_CODES,
  transportCodeForStatus,
} from '@/constants/transport-errors'
import {
  getThrownErrorFields,
  transportFields,
  type ApiErrorFields,
} from '@/lib/api-client/error-fields'
import { apiFetch } from '@/lib/api-client/api-fetch'

interface ApiErrorPayload {
  error?: string
  errorCode?: string
  i18nKey?: string
  traceId?: string
  detail?: string
  /** 助手选定的那个模型缺 key 时才有：界面就地开那一家的 `QuickSetupDialog`。 */
  missingKey?: AssistantOperatorMissingKey
}

/**
 * 失败响应 → 错误字段（o-errors 第二轮）。
 *
 * - 服务端给了 JSON 原因（`error` / `errorCode` / `i18nKey`）：原样带上。
 * - 没有 JSON 原因（网关 / 平台 / 门口回的空体或 HTML 错页）：按 **HTTP 状态**打标
 *   `TRANSPORT_*` + 对应 i18nKey。⛔ 不再拼 `Failed with status N` 这种英文句子 ——
 *   它会被关键词分类猜成别的原因，或被贴上「服务商返回：」（2026-10-29 真机）。
 */
export async function getErrorPayload(
  response: Response,
): Promise<ApiErrorFields> {
  const errorData = (await response
    .json()
    .catch(() => null)) as ApiErrorPayload | null
  const hasReason =
    typeof errorData?.error === 'string' ||
    typeof errorData?.errorCode === 'string' ||
    typeof errorData?.i18nKey === 'string'
  if (!errorData || !hasReason) {
    return transportFields(
      transportCodeForStatus(response.status),
      `HTTP ${response.status}`,
    )
  }
  const missingKey = AssistantOperatorMissingKeySchema.safeParse(
    errorData.missingKey,
  )

  return {
    error: errorData.error ?? `HTTP ${response.status}`,
    ...(typeof errorData.errorCode === 'string'
      ? { errorCode: errorData.errorCode }
      : {}),
    ...(typeof errorData.i18nKey === 'string'
      ? { i18nKey: errorData.i18nKey }
      : {}),
    ...(typeof errorData.traceId === 'string'
      ? { traceId: errorData.traceId }
      : {}),
    ...(typeof errorData.detail === 'string'
      ? { detail: errorData.detail }
      : {}),
    ...(missingKey.success ? { missingKey: missingKey.data } : {}),
  }
}

/** `{ success, data }` 信封的结果：失败一侧只带结构化错误字段。 */
export type ApiResult<T> =
  | { success: true; data: T }
  | ({ success: false } & ApiErrorFields)

/**
 * 读一个 `{ success, data }` 信封的响应。失败时走 {@link getErrorPayload}；2xx 但信封
 * 不对（`success: false` / 没 `data` / 不是 JSON）时带上服务端给的码，没给就是
 * `TRANSPORT_BAD_RESPONSE` —— ⛔ 不再填调用方的英文兜底句。
 */
export async function parseApiResult<T>(
  response: Response,
): Promise<ApiResult<T>> {
  if (!response.ok) {
    return { success: false, ...(await getErrorPayload(response)) }
  }
  const body = (await response.json().catch(() => null)) as {
    success?: boolean
    data?: T
    error?: string
    errorCode?: string
    i18nKey?: string
  } | null
  if (body?.success && body.data !== undefined) {
    return { success: true, data: body.data }
  }
  if (body?.errorCode || body?.i18nKey) {
    return {
      success: false,
      error: body.error ?? body.errorCode ?? `HTTP ${response.status}`,
      ...(body.errorCode ? { errorCode: body.errorCode } : {}),
      ...(body.i18nKey ? { i18nKey: body.i18nKey } : {}),
    }
  }
  return {
    success: false,
    ...transportFields(
      TRANSPORT_ERROR_CODES.BAD_RESPONSE,
      body?.error ?? `HTTP ${response.status}`,
    ),
  }
}

/** `catch (error)` → 失败结果（{@link getThrownErrorFields}）。 */
export function toApiFailure(error: unknown): {
  success: false
} & ApiErrorFields {
  return { success: false, ...getThrownErrorFields(error) }
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
    const response = await apiFetch(
      `${API_ENDPOINTS.DOWNLOAD}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`,
    )

    if (!response.ok) {
      const payload = await getErrorPayload(response)
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
      ...getThrownErrorFields(error),
    }
  }
}
