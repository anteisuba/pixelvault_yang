import {
  MEDIA_TRANSFORMATIONS_PATH_PREFIX,
  VIDEO_POSTER_FIT,
  VIDEO_POSTER_FORMAT,
  VIDEO_POSTER_FRAME_TIME,
  VIDEO_POSTER_SOURCE_EXTENSIONS,
  VIDEO_POSTER_WIDTH,
} from '@/constants/media-transformations'

/**
 * 视频封面 URL（Cloudflare Media Transformations，边缘现场抽帧）。
 *
 * 纯函数、无副作用、客户端可用（`NEXT_PUBLIC_STORAGE_BASE_URL` 会被内联）。
 *
 * 只对**自家 CDN 域下**的视频生成 —— 转换服务跑在我们的 zone 上，源视频默认
 * 也只接受同 zone（见 `constants/media-transformations.ts`）。provider 的临时
 * URL、第三方域一律返回 `null`，宁可没有封面也不发一个注定 4xx 的请求。
 *
 * ⛔ 没有 fallback：拿不到封面就是拿不到，调用方自己画占位。
 */
export function getVideoPosterUrl(
  videoUrl: string | null | undefined,
): string | null {
  if (!videoUrl) return null

  const storageBaseUrl = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  if (!storageBaseUrl) return null

  let source: URL
  let storageBase: URL
  try {
    source = new URL(videoUrl)
    storageBase = new URL(storageBaseUrl)
  } catch {
    return null
  }

  if (source.origin !== storageBase.origin) return null

  const path = source.pathname.toLowerCase()
  const isSupported = VIDEO_POSTER_SOURCE_EXTENSIONS.some((extension) =>
    path.endsWith(extension),
  )
  if (!isSupported) return null

  const options = [
    'mode=frame',
    `time=${VIDEO_POSTER_FRAME_TIME}`,
    `fit=${VIDEO_POSTER_FIT}`,
    `width=${VIDEO_POSTER_WIDTH}`,
    `format=${VIDEO_POSTER_FORMAT}`,
  ].join(',')

  return `${storageBase.origin}${MEDIA_TRANSFORMATIONS_PATH_PREFIX}/${options}/${source.href}`
}
