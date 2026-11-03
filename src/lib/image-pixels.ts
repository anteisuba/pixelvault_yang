/**
 * 服务端改像素的小工具：解码 / 缩放 / 裁 / 拼 / 编码。
 *
 * 2026-11-03 起替代 sharp：sharp 是原生库，网站搬去 Cloudflare Workers 后跑不了。
 * 解码、缩放、编码交给 photon（Rust 编的 wasm，Node 与 Workers 都能跑）；
 * 拼图、铺底色、通道运算这些简单活直接在 RGBA 数组上做。
 *
 * ⚠ 都是整张图进内存：调用方只处理遮罩、参考图、拼图这类有限尺寸的图。
 * 出图后的缩略图 / 预览图走 execution Worker 的 Cloudflare Images（见 r2.ts）。
 */
import { PhotonImage, resize, SamplingFilter } from '@cf-wasm/photon'

import { readImageHeader } from '@/lib/image-header'

/** 一张解开的图：`data` 是 RGBA 逐像素排开，长度 = width × height × 4。 */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8Array
}

export interface RgbColor {
  r: number
  g: number
  b: number
}

/** photon 解得开的格式（动图只取第一帧）。其它格式先挡在外面，⛔ 交给 wasm 去 panic。 */
const DECODABLE_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif'])

function takePixels(image: PhotonImage): RgbaImage {
  try {
    return {
      width: image.get_width(),
      height: image.get_height(),
      data: image.get_raw_pixels(),
    }
  } finally {
    image.free()
  }
}

function toPhoton(image: RgbaImage): PhotonImage {
  return new PhotonImage(image.data, image.width, image.height)
}

/** 解码并按 EXIF 转向摆正。不是支持的图就抛错。 */
export function decodeImage(buffer: Uint8Array): RgbaImage {
  const header = readImageHeader(buffer)
  if (!header || !DECODABLE_FORMATS.has(header.format)) {
    throw new Error(`Unsupported image format: ${header?.format ?? 'unknown'}`)
  }
  let decoded: PhotonImage
  try {
    decoded = PhotonImage.new_from_byteslice(buffer)
  } catch {
    throw new Error('Unsupported or corrupted image file')
  }
  return applyOrientation(takePixels(decoded), header.orientation ?? 1)
}

export function encodePng(image: RgbaImage): Buffer {
  const photon = toPhoton(image)
  try {
    return Buffer.from(photon.get_bytes())
  } finally {
    photon.free()
  }
}

/** JPEG 没有透明：有透明的图先 `flatten` 到底色再编码。 */
export function encodeJpeg(image: RgbaImage, quality: number): Buffer {
  const photon = toPhoton(image)
  try {
    return Buffer.from(photon.get_bytes_jpeg(quality))
  } finally {
    photon.free()
  }
}

/** 拉伸到指定宽高（不保比例）。 */
export function resizeImage(
  image: RgbaImage,
  width: number,
  height: number,
): RgbaImage {
  if (image.width === width && image.height === height) return image
  const photon = toPhoton(image)
  try {
    return takePixels(resize(photon, width, height, SamplingFilter.Lanczos3))
  } finally {
    photon.free()
  }
}

/** 纯色画布（不透明）。 */
export function createCanvas(
  width: number,
  height: number,
  background: RgbColor,
): RgbaImage {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = background.r
    data[i + 1] = background.g
    data[i + 2] = background.b
    data[i + 3] = 255
  }
  return { width, height, data }
}

/** 把 `tile` 按透明度叠到 `canvas` 的 (left, top)，超出画布的部分丢掉。原地改 canvas。 */
export function drawImage(
  canvas: RgbaImage,
  tile: RgbaImage,
  left: number,
  top: number,
): void {
  for (let y = 0; y < tile.height; y++) {
    const cy = top + y
    if (cy < 0 || cy >= canvas.height) continue
    for (let x = 0; x < tile.width; x++) {
      const cx = left + x
      if (cx < 0 || cx >= canvas.width) continue
      const s = (y * tile.width + x) * 4
      const d = (cy * canvas.width + cx) * 4
      const alpha = tile.data[s + 3]! / 255
      if (alpha === 0) continue
      const inv = 1 - alpha
      const outAlpha = alpha + (canvas.data[d + 3]! / 255) * inv
      for (let c = 0; c < 3; c++) {
        canvas.data[d + c] = Math.round(
          outAlpha === 0
            ? 0
            : (tile.data[s + c]! * alpha +
                ((canvas.data[d + c]! * canvas.data[d + 3]!) / 255) * inv) /
                outAlpha,
        )
      }
      canvas.data[d + 3] = Math.round(outAlpha * 255)
    }
  }
}

/** 把 `tile` 的像素原样（连透明度）盖到 `canvas` 的 (left, top)，超出画布的部分丢掉。原地改 canvas。 */
export function pasteImage(
  canvas: RgbaImage,
  tile: RgbaImage,
  left: number,
  top: number,
): void {
  const from = Math.max(0, -left)
  const to = Math.min(tile.width, canvas.width - left)
  if (to <= from) return
  for (let y = 0; y < tile.height; y++) {
    const cy = top + y
    if (cy < 0 || cy >= canvas.height) continue
    const s = (y * tile.width + from) * 4
    canvas.data.set(
      tile.data.subarray(s, s + (to - from) * 4),
      (cy * canvas.width + left + from) * 4,
    )
  }
}

/** 铺到底色上，结果完全不透明。 */
export function flattenImage(
  image: RgbaImage,
  background: RgbColor,
): RgbaImage {
  const canvas = createCanvas(image.width, image.height, background)
  drawImage(canvas, image, 0, 0)
  return canvas
}

export function cropImage(
  image: RgbaImage,
  left: number,
  top: number,
  width: number,
  height: number,
): RgbaImage {
  if (
    left < 0 ||
    top < 0 ||
    width <= 0 ||
    height <= 0 ||
    left + width > image.width ||
    top + height > image.height
  ) {
    throw new Error('Crop area is outside the image')
  }
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * image.width + left) * 4
    data.set(image.data.subarray(from, from + width * 4), y * width * 4)
  }
  return { width, height, data }
}

/**
 * 按比例放进 width×height：
 * - `cover` 铺满再居中裁（不留边）；
 * - `contain` 整张放进去、居中，空出来的地方填底色。
 */
export function fitImage(
  image: RgbaImage,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
  background: RgbColor,
): RgbaImage {
  const scale =
    fit === 'cover'
      ? Math.max(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height)
  const scaledWidth = Math.max(1, Math.round(image.width * scale))
  const scaledHeight = Math.max(1, Math.round(image.height * scale))
  const scaled = resizeImage(image, scaledWidth, scaledHeight)
  if (fit === 'cover') {
    return cropImage(
      scaled,
      Math.floor((scaledWidth - width) / 2),
      Math.floor((scaledHeight - height) / 2),
      Math.min(width, scaledWidth),
      Math.min(height, scaledHeight),
    )
  }
  const canvas = createCanvas(width, height, background)
  drawImage(
    canvas,
    scaled,
    Math.floor((width - scaledWidth) / 2),
    Math.floor((height - scaledHeight) / 2),
  )
  return canvas
}

/** 亮度（灰度）：ITU-R BT.601 加权，和常见图片库的 greyscale 一致。 */
export function luminance(image: RgbaImage, index: number): number {
  const p = index * 4
  return Math.round(
    0.299 * image.data[p]! +
      0.587 * image.data[p + 1]! +
      0.114 * image.data[p + 2]!,
  )
}

/** EXIF 转向 1–8 摆正（2/4/5/7 带镜像）。 */
function applyOrientation(image: RgbaImage, orientation: number): RgbaImage {
  if (orientation <= 1 || orientation > 8) return image
  const { width: w, height: h } = image
  const swapped = orientation >= 5
  const outWidth = swapped ? h : w
  const outHeight = swapped ? w : h
  const data = new Uint8Array(image.data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number
      let ny: number
      switch (orientation) {
        case 2:
          nx = w - 1 - x
          ny = y
          break
        case 3:
          nx = w - 1 - x
          ny = h - 1 - y
          break
        case 4:
          nx = x
          ny = h - 1 - y
          break
        case 5:
          nx = y
          ny = x
          break
        case 6:
          nx = h - 1 - y
          ny = x
          break
        case 7:
          nx = h - 1 - y
          ny = w - 1 - x
          break
        default:
          // 8
          nx = y
          ny = w - 1 - x
      }
      const s = (y * w + x) * 4
      const d = (ny * outWidth + nx) * 4
      data[d] = image.data[s]!
      data[d + 1] = image.data[s + 1]!
      data[d + 2] = image.data[s + 2]!
      data[d + 3] = image.data[s + 3]!
    }
  }
  return { width: outWidth, height: outHeight, data }
}
