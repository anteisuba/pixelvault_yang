/**
 * 只读图片文件头（格式 / 宽高 / EXIF 转向），⛔ 不解码像素。
 *
 * 2026-11-03 起替代 `sharp(buffer).metadata()`：sharp 是原生库，网站搬去
 * Cloudflare Workers 后跑不了；这里用纯 JS 的 image-size，Node 和 Workers 都能跑。
 */
import { imageSize } from 'image-size'

export interface ImageHeader {
  /** 与原来 sharp 的叫法一致：jpeg / png / webp / gif / svg / heif / tiff …… */
  format: string
  /** 文件里存的宽高（未按 EXIF 转向摆正）。 */
  width: number
  height: number
  /** EXIF 转向 1–8；没有就是 undefined。 */
  orientation?: number
}

const FORMAT_ALIASES: Record<string, string> = { jpg: 'jpeg' }

/** 读不出来（不是图、文件头坏了）回 null。 */
export function readImageHeader(buffer: Uint8Array): ImageHeader | null {
  try {
    const result = imageSize(buffer)
    if (!result.type || !result.width || !result.height) return null
    return {
      format: FORMAT_ALIASES[result.type] ?? result.type,
      width: result.width,
      height: result.height,
      orientation: result.orientation,
    }
  } catch {
    return null
  }
}

/** 按 EXIF 转向摆正后的宽高（转向 5–8 是转了 90°，宽高对调）。 */
export function orientedSize(header: ImageHeader): {
  width: number
  height: number
} {
  const swapped = header.orientation !== undefined && header.orientation >= 5
  return swapped
    ? { width: header.height, height: header.width }
    : { width: header.width, height: header.height }
}
