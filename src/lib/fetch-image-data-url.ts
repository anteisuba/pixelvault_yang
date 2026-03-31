/**
 * Converts an image URL to a base64 data URL.
 *
 * Strategy:
 * 1. Try <img crossOrigin="anonymous"> + Canvas (works if R2 has CORS headers)
 * 2. Fallback: /api/image/proxy — server-side fetch, always bypasses CORS
 */
export function fetchImageAsDataUrl(url: string): Promise<string> {
  // Already a data URL — return as-is
  if (url.startsWith('data:')) return Promise.resolve(url)

  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          fetchViaProxy(url).then(resolve, reject)
          return
        }
        ctx.drawImage(img, 0, 0)
        const dataUrl = canvas.toDataURL('image/png')
        resolve(dataUrl)
      } catch {
        // Canvas tainted (CORS not configured on origin) — fallback to proxy
        fetchViaProxy(url).then(resolve, reject)
      }
    }

    img.onerror = () => {
      // Image failed to load with crossOrigin — try proxy fallback
      fetchViaProxy(url).then(resolve, reject)
    }

    img.src = url
  })
}

/**
 * Fallback: fetch image through our own API proxy route.
 * Server-side fetch bypasses CORS entirely.
 */
async function fetchViaProxy(url: string): Promise<string> {
  const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch image via proxy: ${res.status}`)
  }
  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read image as data URL'))
    reader.readAsDataURL(blob)
  })
}
