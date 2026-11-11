/**
 * iPhone / iPad 上把图片、视频存进「照片」。
 *
 * iOS Safari 对 `<a download>` 和附件下载一律落进「文件」App，网页没有直接写相册的接口；
 * 唯一的路是系统分享面板（`navigator.share({ files })`），面板里有「存储图像 / 存储视频」。
 *
 * ⚠ 分享面板要用户手势：取字节耗时久了（大图、视频、慢网），WebKit 会以
 * `NotAllowedError` 拒绝。这时把文件交给 `SaveToPhotosHost`，它弹一条带「存到相册」
 * 键的提示，用户再点一下就是新的手势。
 */

const PHOTO_SAVABLE_EXTENSIONS: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

/** 「照片」收得下的类型；SVG、音频、webm、zip 之类照旧下载成文件。 */
export function photoMimeForFileName(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return PHOTO_SAVABLE_EXTENSIONS[extension] ?? null
}

/** iPhone / iPad（iPadOS 默认报桌面版 Mac UA，靠触点数认出来）。 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function shouldSaveToPhotos(fileName: string): boolean {
  return (
    isIosDevice() &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    photoMimeForFileName(fileName) !== null
  )
}

export function toPhotoFile(blob: Blob, fileName: string): File {
  const isMedia =
    blob.type.startsWith('image/') || blob.type.startsWith('video/')
  const type = isMedia
    ? blob.type
    : (photoMimeForFileName(fileName) ?? blob.type)
  return new File([blob], fileName, { type })
}

/**
 * 从自家 CDN 跨域取字节（R2 对站点域名回 CORS 头）。
 *
 * 多带一个查询参数换缓存键：页面上 `<img>` / `<video>` 取回的那份不带
 * `Access-Control-Allow-Origin`，R2 又不回 `Vary: Origin`，原地址可能被缓存里那份没头的
 * 响应顶掉（同 `lib/video-frame-capture` 的 `corsCacheKeyUrl`）。
 */
export async function fetchCdnFile(
  url: string,
  fileName: string,
): Promise<File | null> {
  try {
    const corsUrl = new URL(url)
    corsUrl.searchParams.set('pv-cors', '1')
    const response = await fetch(corsUrl.toString(), {
      mode: 'cors',
      credentials: 'omit',
    })
    if (!response.ok) return null
    return toPhotoFile(await response.blob(), fileName)
  } catch {
    return null
  }
}

export type ShareFileOutcome = 'shared' | 'cancelled' | 'needs-tap' | 'failed'

export async function shareFile(file: File): Promise<ShareFileOutcome> {
  if (!navigator.canShare({ files: [file] })) return 'failed'
  try {
    await navigator.share({ files: [file] })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled'
    }
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return 'needs-tap'
    }
    return 'failed'
  }
}

type TapListener = (file: File) => void

let tapListener: TapListener | null = null

/** `SaveToPhotosHost` 挂上时注册；返回卸载函数。 */
export function subscribeSaveToPhotosTap(listener: TapListener): () => void {
  tapListener = listener
  return () => {
    if (tapListener === listener) tapListener = null
  }
}

/** 交给提示条让用户再点一下；没挂提示条（应用壳之外）返回 false。 */
function requestSaveToPhotosTap(file: File): boolean {
  if (!tapListener) return false
  tapListener(file)
  return true
}

/** 弹分享面板存相册；返回 false 表示这条路走不通，调用方照旧下载成文件。 */
export async function saveFileToPhotos(file: File): Promise<boolean> {
  const outcome = await shareFile(file)
  if (outcome === 'shared' || outcome === 'cancelled') return true
  if (outcome === 'needs-tap') return requestSaveToPhotosTap(file)
  return false
}
