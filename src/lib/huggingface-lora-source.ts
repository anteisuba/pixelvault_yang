const HUGGINGFACE_LORA_SOURCE_HOSTS = new Set([
  'huggingface.co',
  'www.huggingface.co',
])

export interface HuggingFaceLoraSource {
  repoId: string
  revision: string
}

/**
 * H1 生成侧「样例参考」（lora-workbench.md §13）：从挂载的 `LoraAssetRecord.
 * loraUrl` 反推 Hugging Face 仓库 `repoId`/`revision`，去请求
 * `/api/lora-assets/huggingface/showcase`。`loraUrl` 是
 * `huggingface-lora.service.ts` 的 `buildHuggingFaceResolveUrl` 生成的
 * resolve 直链：`https://huggingface.co/{repoId}/resolve/{revision}/
 * {filename...}`（`repoId` 本身含未转义的 `/`）——这里原样反解析。
 *
 * 纯函数，不发请求，客户端/服务端都能跑；不是 HF resolve URL（civitai
 * 直链等）一律返回 null，调用方据此判定「这个挂载是不是 HF 资产」。
 */
export function parseHuggingFaceLoraSourceUrl(
  loraUrl: string,
): HuggingFaceLoraSource | null {
  let parsed: URL
  try {
    parsed = new URL(loraUrl)
  } catch {
    return null
  }
  if (!HUGGINGFACE_LORA_SOURCE_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  const resolveIndex = segments.indexOf('resolve')
  if (resolveIndex < 1) return null

  const revisionSegment = segments[resolveIndex + 1]
  if (!revisionSegment) return null

  const repoId = segments
    .slice(0, resolveIndex)
    .map((segment) => decodeURIComponent(segment))
    .join('/')
  const revision = decodeURIComponent(revisionSegment)
  if (!repoId || !revision) return null

  return { repoId, revision }
}
