import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import type { LoraAssetType } from '@/types'

/**
 * 从 Civitai 的数据造一条 CivitaiLoraLibraryItem 时的共享零件。
 *
 * 抽到 lib 是因为现在有两个消费者：走上游 meilisearch 的搜索路径，和 L3 的
 * 本地目录镜像。两边必须给出逐字段一致的结果——本地命中和上游命中长得不
 * 一样的话，用户会在上游降级时看到界面"变了个样"，那比慢更让人不安。
 * 放在 lib 而不是让镜像去 import 服务，也避开了两个服务互相 import 的环。
 */

// 大图（1–5 MB）改写成对应尺寸的 transform。Retina 屏 ×2 在大多数列表场景
// 已经够清；超出的 LCP/带宽成本远大于细节收益。
export const CIVITAI_THUMB_WIDTH = 96 // 列表 row 40×40 缩略；挂载栈 chip / facepile 用
// 公开库封面网格卡（~166–221px CSS，retina 需 ~400 物理 px）。此前网格误用了
// 96 档缩略图（P0-3：96px 拉伸到 ~200px 卡上系统性发糊），640 档又是给抽屉
// 大图用的、网格 30 张同屏时流量翻倍——450 是网格卡专用的中间档。
export const CIVITAI_CARD_WIDTH = 450
export const CIVITAI_COVER_WIDTH = 640 // Inspector aspect-video / AssetCard square
export const CIVITAI_PREVIEW_WIDTH = 768 // 预留：未来的预览画廊 / 大图轮播

/** 一页搜索结果里最多带几张预览图。 */
export const CIVITAI_ITEM_MAX_IMAGES = 6

const CIVITAI_DOWNLOAD_API = 'https://civitai.com/api/download/models'

// Cloudflare Images 账号级 bucket——同一 bucket 在两个完全无关模型/作者的
// 封面图之间保持一致（不是按图分配），实测对照 REST 响应确认。
const CIVITAI_SEARCH_IMAGE_BUCKET = 'xG1nkqKTMzGDvpLrqFT7WA'

export interface CivitaiCdnImage {
  id: number
  /** CDN 路径里的 uuid 目录段，不是完整 URL */
  url: string
  type?: string
  nsfwLevel?: number
  /** Civitai 给每张图的 blurhash——封面在图到之前先铺它的平均色。 */
  hash?: string
}

const BLURHASH_BASE83 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~'

/**
 * blurhash 的第 3–6 位是整张图的平均色（sRGB，base83 编码的 24 位整数）。
 * 只取这一格就够「先铺颜色、图到了再由糊变清」，不必为整张模糊图引依赖。
 */
export function blurhashAverageColor(
  hash: string | null | undefined,
): string | null {
  if (!hash || hash.length < 6) return null
  let value = 0
  for (const char of hash.slice(2, 6)) {
    const digit = BLURHASH_BASE83.indexOf(char)
    if (digit < 0) return null
    value = value * 83 + digit
  }
  return `#${value.toString(16).padStart(6, '0')}`
}

/**
 * 版本下载地址是确定性的，不需要二段解析。2026-08-19 实测 32/32（跨下载量
 * top / 第 2 万名 / 最新发布三段采样，含一个早期访问模型）：REST 返回的
 * downloadUrl 恒等于这个拼法，零不符、零缺失。
 */
export function buildCivitaiVersionDownloadUrl(versionId: number): string {
  return `${CIVITAI_DOWNLOAD_API}/${versionId}`
}

/**
 * meilisearch 图片对象没有拼好的完整 URL，只有 CDN 路径的两段（id 对应文
 * 件名、url 对应 uuid 目录）——真实 URL 由固定 bucket 拼出来。
 */
export function buildCivitaiSearchImageOriginalUrl(image: {
  id: number
  url: string
}): string {
  return `https://image.civitai.com/${CIVITAI_SEARCH_IMAGE_BUCKET}/${image.url}/original=true/${image.id}.jpeg`
}

/** 视频样例在网格卡与详情瀑布里播的片段宽度（450 宽约 0.85 MB / 5 秒，768 约 2.3 MB）。 */
export const CIVITAI_CLIP_WIDTH = 450

/**
 * Civitai 样例可以是视频（mp4）：`<img>` 渲染不了，要转码成 JPEG 静帧
 * （封面 / 缩略）或压缩片段（`<video>` 播）。只有明确标 `type: 'video'` 才
 * 算视频——缺省视为图片，老响应 / 测试 fixture 不受影响。
 */
export function isCivitaiVideo(image: { type?: string | null }): boolean {
  return (image.type ?? 'image').toLowerCase() === 'video'
}

/**
 * 一张样例在 `width` 档的静态图：图片就是缩放；视频取 JPEG 静帧（CDN 对静帧
 * 忽略宽度、总给全尺寸，2026-10-15 实测）。之后再按宽度改写会保留静帧。
 */
export function civitaiStillUrl(
  url: string,
  isVideo: boolean,
  width: number,
): string {
  return isVideo
    ? rewriteCivitaiImageUrl(url, { width, staticFrame: true, transcode: true })
    : rewriteCivitaiImageUrl(url, { width })
}

/** 视频样例的压缩 mp4 片段。⛔ 走图片代理：它只放行 image/*（视频回 415）。 */
export function civitaiClipUrl(
  url: string,
  width: number = CIVITAI_CLIP_WIDTH,
): string {
  return rewriteCivitaiImageUrl(url, { width, transcode: true })
}

export function inferLoraType(tags: string[], name: string): LoraAssetType {
  const haystack = `${name} ${tags.join(' ')}`.toLowerCase()
  if (
    haystack.includes('character') ||
    haystack.includes('person') ||
    haystack.includes('subject')
  ) {
    return 'subject'
  }
  return 'style'
}

/** 版本对象的 hashData 里挑 AutoV3——挂载栈的哈希匹配靠它。 */
export function pickAutoV3Hash(
  hashData: readonly { hash: string; type: string }[] | undefined | null,
): string | null {
  const match = hashData?.find((entry) => entry.type.toUpperCase() === 'AUTOV3')
  return match?.hash ?? null
}

export interface CivitaiItemImageUrls {
  coverImageUrlOriginal: string | null
  coverImageUrl: string | null
  thumbImageUrl: string | null
  cardImageUrl: string | null
  previewImageUrls: string[]
  coverColor: string | null
  /** 封面是视频时网格卡播的片段；图片封面是 null。 */
  cardVideoUrl: string | null
}

/**
 * 一组 CDN 图片对象 → item 需要的全套尺寸档。上游路径和镜像路径共用这一
 * 份，保证两边的图片档位逐字段一致。
 */
export function buildCivitaiItemImageUrls(
  images: readonly CivitaiCdnImage[],
  maxImageNsfwLevel: number,
): CivitaiItemImageUrls {
  const shown = images
    .filter((image) => (image.nsfwLevel ?? 1) <= maxImageNsfwLevel)
    .slice(0, CIVITAI_ITEM_MAX_IMAGES)
  // 视频的「原图」是全尺寸静帧（带 transcode，之后各档改宽度都还是静帧）。
  const originals = shown.map((image) => {
    const original = buildCivitaiSearchImageOriginalUrl(image)
    return isCivitaiVideo(image)
      ? civitaiStillUrl(original, true, CIVITAI_PREVIEW_WIDTH)
      : original
  })
  const cover = shown[0]

  const coverOriginal = originals[0] ?? null
  return {
    coverColor: blurhashAverageColor(cover?.hash),
    cardVideoUrl:
      cover && isCivitaiVideo(cover)
        ? civitaiClipUrl(buildCivitaiSearchImageOriginalUrl(cover))
        : null,
    coverImageUrlOriginal: coverOriginal,
    coverImageUrl: coverOriginal
      ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_COVER_WIDTH })
      : null,
    thumbImageUrl: coverOriginal
      ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_THUMB_WIDTH })
      : null,
    cardImageUrl: coverOriginal
      ? rewriteCivitaiImageUrl(coverOriginal, { width: CIVITAI_CARD_WIDTH })
      : null,
    previewImageUrls: originals.map((url) =>
      rewriteCivitaiImageUrl(url, { width: CIVITAI_PREVIEW_WIDTH }),
    ),
  }
}
