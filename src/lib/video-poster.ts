import {
  IMAGE_TRANSFORMATIONS_PATH_PREFIX,
  MEDIA_TRANSFORMATIONS_PATH_PREFIX,
  VIDEO_POSTER_FIT,
  VIDEO_POSTER_FORMAT,
  VIDEO_POSTER_FRAME_TIME,
  VIDEO_POSTER_SOURCE_EXTENSIONS,
  VIDEO_POSTER_WIDTH,
} from '@/constants/media-transformations'

/**
 * 视频封面 / 任意时刻截帧 / 图片缩略的 URL（Cloudflare 边缘现场转换）。
 *
 * 纯函数、无副作用、客户端可用（`NEXT_PUBLIC_STORAGE_BASE_URL` 会被内联）。
 *
 * 只对**自家 CDN 域下**的源生成 —— 转换服务跑在我们的 zone 上，源默认也只接受
 * 同 zone（见 `constants/media-transformations.ts`）。provider 的临时 URL、第三方
 * 域一律返回 `null`，宁可没有预览也不发一个注定 4xx 的请求。
 *
 * ⛔ 没有 fallback：拿不到就是拿不到，调用方自己画占位 / 说原因。
 */

/** 源必须在我们的 CDN 域上；返回解析好的源与 CDN 源站。 */
function toSameZoneSource(
  url: string | null | undefined,
): { source: URL; origin: string } | null {
  if (!url) return null

  const storageBaseUrl = process.env.NEXT_PUBLIC_STORAGE_BASE_URL
  if (!storageBaseUrl) return null

  let source: URL
  let storageBase: URL
  try {
    source = new URL(url)
    storageBase = new URL(storageBaseUrl)
  } catch {
    return null
  }

  if (source.origin !== storageBase.origin) return null
  return { source, origin: storageBase.origin }
}

function buildFrameUrl(
  videoUrl: string | null | undefined,
  time: string,
  width: number,
): string | null {
  const zone = toSameZoneSource(videoUrl)
  if (!zone) return null

  const path = zone.source.pathname.toLowerCase()
  const isSupported = VIDEO_POSTER_SOURCE_EXTENSIONS.some((extension) =>
    path.endsWith(extension),
  )
  if (!isSupported) return null

  const options = [
    'mode=frame',
    `time=${time}`,
    `fit=${VIDEO_POSTER_FIT}`,
    `width=${width}`,
    `format=${VIDEO_POSTER_FORMAT}`,
  ].join(',')

  return `${zone.origin}${MEDIA_TRANSFORMATIONS_PATH_PREFIX}/${options}/${zone.source.href}`
}

/**
 * 列表封面。⚠ URL 必须逐字稳定：转换按 (源, 参数) 计费与缓存，改了写法等于把
 * 所有封面重新截一遍、重新计一遍费。
 */
export function getVideoPosterUrl(
  videoUrl: string | null | undefined,
): string | null {
  return buildFrameUrl(videoUrl, VIDEO_POSTER_FRAME_TIME, VIDEO_POSTER_WIDTH)
}

/**
 * 任意时刻的一帧（MCP `look_at`）。时间按**整毫秒**写（`2500ms`）——2026-09-28
 * 实测与 `2.5s` 取到同一帧；整数写法避免浮点尾巴让同一时刻出现两个缓存键。
 */
export function getVideoFrameUrl(
  videoUrl: string | null | undefined,
  timeSec: number,
  width: number,
): string | null {
  const ms = Math.max(0, Math.round(timeSec * 1000))
  return buildFrameUrl(videoUrl, `${ms}ms`, width)
}

/** 图片缩略（Image Transformations，同一个 zone 开关）。 */
export function getImagePreviewUrl(
  imageUrl: string | null | undefined,
  width: number,
): string | null {
  const zone = toSameZoneSource(imageUrl)
  if (!zone) return null
  const options = [
    `width=${width}`,
    `fit=${VIDEO_POSTER_FIT}`,
    `format=jpeg`,
  ].join(',')
  return `${zone.origin}${IMAGE_TRANSFORMATIONS_PATH_PREFIX}/${options}/${zone.source.href}`
}
