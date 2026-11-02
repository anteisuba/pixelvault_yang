/**
 * Civitai LoRA 下载链接格式：
 *   https://civitai.com/api/download/models/{modelVersionId}[?type=...]
 *
 * 旧收藏行没存 civitaiModelVersionId（字段后加的），但 loraUrl 必有 —
 * versionId 可以从 URL 确定性恢复，这是收藏自愈回填的入口。
 */
const CIVITAI_DOWNLOAD_PATH_RE = /\/api\/download\/models\/(\d+)(?:[/?#]|$)/

export function parseCivitaiVersionIdFromDownloadUrl(
  loraUrl: string,
): number | null {
  if (!loraUrl) return null
  let parsed: URL
  try {
    parsed = new URL(loraUrl)
  } catch {
    return null
  }
  if (!parsed.hostname.endsWith('civitai.com')) return null
  const match = CIVITAI_DOWNLOAD_PATH_RE.exec(parsed.pathname)
  if (!match?.[1]) return null
  const versionId = Number(match[1])
  return Number.isSafeInteger(versionId) && versionId > 0 ? versionId : null
}
