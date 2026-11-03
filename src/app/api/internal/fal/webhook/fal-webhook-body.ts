/**
 * FAL webhook 请求体的解析（从 route.ts 拆出：Next 的 route 文件只能导出 HTTP 方法和路由配置，
 * 多导出的函数会让 webpack 构建的类型检查失败）。
 */

// ─── FAL payload extraction ──────────────────────────────────────────────────

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function readString(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const v = obj[key]
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * Extract a completed video artifact from a FAL webhook body.
 * FAL sends the same JSON that the responseUrl returns:
 *   { video: { url, content_type, ... }, thumbnail: { url, ... }, ... }
 */
export function extractFalVideoResult(body: Record<string, unknown>): {
  artifactUrl: string
  thumbnailUrl?: string
  mimeType?: string
} | null {
  const video = isRecord(body.video) ? body.video : null
  const artifactUrl = video ? readString(video, 'url') : null
  if (!artifactUrl) return null

  const thumbnail = isRecord(body.thumbnail) ? body.thumbnail : null
  const thumbnailUrl = thumbnail
    ? (readString(thumbnail, 'url') ?? undefined)
    : undefined
  const mimeType = video
    ? (readString(video, 'content_type') ?? undefined)
    : undefined

  return { artifactUrl, thumbnailUrl, mimeType }
}

export function isFalErrorBody(body: Record<string, unknown>): boolean {
  return (
    readString(body, 'status') === 'ERROR' ||
    typeof body.error === 'string' ||
    typeof body.detail === 'string' ||
    Array.isArray(body.detail) ||
    (isRecord(body.payload) && Array.isArray(body.payload.detail))
  )
}

export function extractFalDetailMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (!Array.isArray(detail)) return null

  const parts = detail
    .map((item) => {
      if (typeof item === 'string') return item
      if (!isRecord(item)) return null
      const type = readString(item, 'type')
      const message = readString(item, 'msg') ?? readString(item, 'message')
      if (type && message) return `${type}: ${message}`
      return message ?? type
    })
    .filter((item): item is string => Boolean(item))

  return parts.length > 0 ? parts.join('; ') : null
}

export function extractFalErrorMessage(body: Record<string, unknown>): string {
  const payload = isRecord(body.payload) ? body.payload : null
  return (
    readString(body, 'error') ??
    extractFalDetailMessage(body.detail) ??
    (payload ? extractFalDetailMessage(payload.detail) : null) ??
    'FAL generation failed.'
  )
}
