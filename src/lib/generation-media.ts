import { isGifMimeType } from '@/lib/gif-image'
import { getVideoPosterUrl } from '@/lib/video-poster'
import type { GenerationRecord } from '@/types'

export interface GenerationAudioSegment {
  text: string
  start: number
  end: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toGenerationAudioSegment(
  value: unknown,
): GenerationAudioSegment | null {
  if (!isRecord(value)) return null

  const { text, start, end } = value
  if (
    typeof text !== 'string' ||
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  ) {
    return null
  }

  const trimmedText = text.trim()
  if (!trimmedText) return null

  return {
    text: trimmedText,
    start,
    end,
  }
}

export function getGenerationAudioSegments(
  generation: Pick<GenerationRecord, 'snapshot'> | null | undefined,
): GenerationAudioSegment[] {
  if (!generation || !isRecord(generation.snapshot)) return []

  const rawSegments =
    generation.snapshot.timestamps ?? generation.snapshot.segments
  if (!Array.isArray(rawSegments)) return []

  return rawSegments
    .map(toGenerationAudioSegment)
    .filter((segment): segment is GenerationAudioSegment => segment !== null)
}

/**
 * 视频封面。派生列（`thumbnailUrl` / `previewUrl`）优先 —— provider 自带缩略图
 * 时它才是最准的一帧；都没有就让 CDN 现场抽一帧（Media Transformations）。
 *
 * ⚠ 返回 `null` 是**正常结果**（第三方域、非 mp4/webm、缺 CDN 域配置），调用方
 * 必须能画出占位，不许把视频 URL 塞给 `<img>`。
 */
export function getGenerationVideoPosterUrl(
  generation: Pick<
    GenerationRecord,
    'thumbnailUrl' | 'previewUrl' | 'url'
  > | null,
): string | null {
  if (!generation) return null
  return (
    generation.thumbnailUrl ??
    generation.previewUrl ??
    getVideoPosterUrl(generation.url)
  )
}

export function getGenerationThumbnailUrl(
  generation: GenerationRecord,
): string {
  // VIDEO 的 `url` 是一段视频，塞进 `<img>` 只会是一格空白 —— 这一档的最后
  // 一站是 CDN 抽帧，不是原文件。
  if (generation.outputType === 'VIDEO') {
    return getGenerationVideoPosterUrl(generation) ?? generation.url
  }
  return generation.thumbnailUrl ?? generation.previewUrl ?? generation.url
}

/**
 * Persisted render frame for a 3D generation. The worker initially stores the
 * GLB in both `url` and `modelUrl`; after the browser captures a frame, the
 * poster endpoint replaces `url` with an image while `modelUrl` keeps the GLB.
 */
export function getGenerationModel3DPosterUrl(
  generation: GenerationRecord,
): string | null {
  if (generation.outputType !== 'MODEL_3D') return null

  const derivedPoster = generation.thumbnailUrl ?? generation.previewUrl
  if (derivedPoster) return derivedPoster

  const urlIsPoster =
    generation.mimeType.startsWith('image/') &&
    generation.url !== generation.modelUrl
  return urlIsPoster ? generation.url : null
}

/**
 * Best still image for a 3D tile/loading state. A source image is an honest
 * fallback while a render poster has not been captured yet; the GLB itself is
 * never a valid image source.
 */
export function getGenerationModel3DVisualUrl(
  generation: GenerationRecord,
): string | null {
  return (
    getGenerationModel3DPosterUrl(generation) ??
    generation.referenceImageUrl ??
    null
  )
}

/**
 * Best source for a *full-size* view (detail sheet, gallery detail, modal).
 *
 * `thumbnailUrl` is a grid tile, long-edge capped by
 * `IMAGE_PREVIEW_VARIANTS.thumbnail` — it must never win here. User uploads
 * deliberately derive only a thumbnail (see `createImageThumbnailAsset`,
 * "a stored upload serves its full original in the detail view"), so for an
 * IMAGE a missing `previewUrl` means *the original is the preview*. Falling
 * through to the thumbnail instead blew every uploaded image up from 384px
 * to the full viewport — a ~3.5x upscale of a q78 WebP, which is what
 * "上传的图片画质很低" actually was.
 *
 * VIDEO / AUDIO / MODEL_3D keep the thumbnail step: their `url` is a media
 * file, not a displayable image, so a poster/cover derivative is the only
 * valid image source.
 */
export function getGenerationPreviewUrl(generation: GenerationRecord): string {
  if (generation.outputType === 'IMAGE') {
    // GIF 的派生小图只有第一帧（Worker `anim: false`），详情要播原件。
    if (isGifMimeType(generation.mimeType)) return generation.url
    return generation.previewUrl ?? generation.url
  }
  return generation.previewUrl ?? generation.thumbnailUrl ?? generation.url
}

/** 派生图比例与作品比例差多少（倍数）才算「不是同一张的缩小版」。 */
const DERIVATIVE_RATIO_TOLERANCE = 1.2

/**
 * 派生小图 / 预览图被补成了**正方形黑边图**（2026-11-19 库走查：gemini 出的 16:9 图，
 * 原图 1376×768，`.thumbnail.webp` 却是 768×768、`.preview.webp` 1280×1280，上下各一条
 * 纯黑 —— 黑条烧在像素里，格子 `object-cover` 也裁不掉）。
 *
 * 判据只认「派生图是正方形、而作品本身不是」：正方形是这种坏图的指纹；只差一点比例的
 * （provider 记的尺寸与实际出图差几十像素）照旧用派生图，⛔ 为它拉原图。
 * 任何一边量不到（0 / 未知）一律不算。
 */
export function isLetterboxedDerivative(
  natural: { width: number; height: number },
  expectedRatio: number | null | undefined,
): boolean {
  if (!expectedRatio || !Number.isFinite(expectedRatio) || expectedRatio <= 0)
    return false
  if (natural.width <= 0 || natural.height <= 0) return false
  if (natural.width !== natural.height) return false
  return Math.max(expectedRatio, 1 / expectedRatio) > DERIVATIVE_RATIO_TOLERANCE
}

/**
 * 画廊卡（`ImageCard`）把这一条当音频画：方形播放卡，⛔ 按作品宽高比。
 * 卡片与画廊图墙的估高（`GalleryGrid`）共用这一条，两边的格子高度才对得上。
 */
export function isAudioGenerationCard(
  generation: Pick<GenerationRecord, 'outputType' | 'url'>,
): boolean {
  return (
    generation.outputType === 'AUDIO' ||
    generation.url.endsWith('.mp3') ||
    generation.url.endsWith('.wav')
  )
}

/** 图片作品本身的宽高比；不是图片或尺寸未知时为 null（不做黑边检查）。 */
export function getGenerationImageRatio(
  generation: Pick<GenerationRecord, 'outputType' | 'width' | 'height'>,
): number | null {
  if (generation.outputType !== 'IMAGE') return null
  return generation.width > 0 && generation.height > 0
    ? generation.width / generation.height
    : null
}
