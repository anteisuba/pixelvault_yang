import { rewriteCivitaiImageUrl } from './civitai-image-url'

/**
 * 挂载栈 chip / facepile 的缩略图三级兜底：cover → 第一张 preview → null
 * （null 时 UI 渲染按 type 的占位图标）。
 *
 * 字段全部按 optional 防御：旧 localStorage 挂载条目只过了
 * `isValidEntry`（有 asset 键即可），没有经过 Zod 校验，运行时可能缺
 * coverImageUrl / previewImageUrls 键（重新收藏后补全）。
 */
export interface LoraThumbnailSource {
  coverImageUrl?: string | null
  previewImageUrls?: readonly string[] | null
}

export function loraThumbnailUrl(
  asset: LoraThumbnailSource,
  width: number,
): string | null {
  const raw =
    asset.coverImageUrl ??
    (Array.isArray(asset.previewImageUrls)
      ? asset.previewImageUrls.find(Boolean)
      : undefined) ??
    null
  if (!raw) return null
  return rewriteCivitaiImageUrl(raw, { width })
}
