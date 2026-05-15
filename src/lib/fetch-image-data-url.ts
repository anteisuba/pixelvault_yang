/**
 * Convert an image URL to a base64 data URL.
 *
 * Strategy:
 * 1. Pass-through for `data:` inputs.
 * 2. CORS-friendly `fetch(url)` → `Blob` → `FileReader.readAsDataURL`. This
 *    keeps the original bytes (and original mime type — WebP / JPEG / PNG)
 *    so we don't re-encode multi-MB images into oversized PNGs.
 * 3. Fallback: `/api/image/proxy` for cross-origin URLs that block the
 *    direct fetch. The proxy is the only path that needs a server hop, so
 *    R2 / CDN assets with permissive CORS land in step 2 and stay client-side.
 *
 * Downstream services (`image-analysis`, `prompt-assistant`, `llm-text`)
 * still expect `data:` URLs, so this helper continues to return one — the
 * win is dropping the canvas + `toDataURL('image/png')` re-encoding step
 * the previous implementation used, which dominated runtime for large
 * reference images and blew JPEGs up into PNGs.
 */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url

  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error(`status ${res.status}`)
    return await blobToDataUrl(await res.blob())
  } catch {
    // CORS rejected, network error, or non-2xx — fall back to the proxy
    // route, which always works because the fetch happens server-side.
    return fetchViaProxy(url)
  }
}

async function fetchViaProxy(url: string): Promise<string> {
  const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch image via proxy: ${res.status}`)
  }
  return blobToDataUrl(await res.blob())
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read image as data URL'))
    reader.readAsDataURL(blob)
  })
}
