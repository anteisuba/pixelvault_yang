import {
  SHOT_DETECT_ASSET_BYTES,
  SHOT_DETECT_ASSET_KEYS,
  SHOT_DETECT_CACHE_NAME,
} from '@/constants/shot-detect'

/**
 * 切镜模型与 wasm 的地址、缓存与下载。主线程和后台线程都用：主线程只问「下过没有」
 * （决定要不要先弹下载提示），真正的下载在后台线程里做。
 *
 * 缓存用 Cache Storage 而不是 HTTP 缓存 —— 46 MB 的文件浏览器 HTTP 缓存说清就清，
 * 「只下这一次」这句话得靠我们自己存住。
 */

export interface ShotDetectAssetUrls {
  model: string
  wasm: string
}

/** 拼出 R2 上的两个地址；没配 CDN 基址（本地缺 env）就是 null，界面说用不了。 */
export function getShotDetectAssetUrls(): ShotDetectAssetUrls | null {
  const base = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  if (!base) return null
  const trimmed = base.replace(/\/+$/, '')
  return {
    model: `${trimmed}/${SHOT_DETECT_ASSET_KEYS.model}`,
    wasm: `${trimmed}/${SHOT_DETECT_ASSET_KEYS.wasm}`,
  }
}

/** 第一次要下多少字节（两个文件之和）。 */
export const SHOT_DETECT_TOTAL_BYTES =
  SHOT_DETECT_ASSET_BYTES.model + SHOT_DETECT_ASSET_BYTES.wasm

function cacheAvailable(): boolean {
  return typeof caches !== 'undefined'
}

/** 两个文件是不是都已经在缓存里 —— 都在就跳过下载提示直接开切。 */
export async function areShotDetectAssetsCached(
  urls: ShotDetectAssetUrls,
): Promise<boolean> {
  if (!cacheAvailable()) return false
  try {
    const cache = await caches.open(SHOT_DETECT_CACHE_NAME)
    const [model, wasm] = await Promise.all([
      cache.match(urls.model),
      cache.match(urls.wasm),
    ])
    return Boolean(model && wasm)
  } catch {
    return false
  }
}

/**
 * 取一个文件：缓存里有就直接读；没有就下载（逐块报进度），下完整个放进缓存。
 * 只有完整下完才写缓存 —— 中途被取消 / 断网不会留下半个文件。
 */
export async function loadShotDetectAsset(
  url: string,
  expectedBytes: number,
  onProgress: (loadedBytes: number) => void,
): Promise<ArrayBuffer> {
  const cache = cacheAvailable()
    ? await caches.open(SHOT_DETECT_CACHE_NAME).catch(() => null)
    : null
  const cached = await cache?.match(url)
  if (cached) {
    const buffer = await cached.arrayBuffer()
    onProgress(buffer.byteLength)
    return buffer
  }

  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok || !response.body) {
    throw new Error(`asset ${response.status} ${url}`)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress(Math.min(loaded, expectedBytes))
  }
  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (cache) {
    await cache
      .put(
        url,
        new Response(bytes, {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      )
      .catch(() => undefined)
  }
  return bytes.buffer
}
