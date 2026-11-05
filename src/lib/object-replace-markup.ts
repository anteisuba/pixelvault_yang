/**
 * 多框编号改图 → OpenAI `markup` 标注层（GPT Image 2.5 / 2.6）。
 *
 * 官方契约（Image generation guide · "Guide an edit with markup"）：
 * - 单独一张**透明** PNG，⛔ 不能压到原图上；
 * - 按 EXIF 摆正后与第一张输入图**同宽高**；
 * - 两者各不超过 16,777,216 像素，标注文件 ≤ 50 MB；
 * - ⛔ 不能与 `mask` 同发。
 *
 * 画法：每个框一圈红色描边 + 左上角一块红底白字的编号牌（就是界面上的 ①②③）。
 * 数字用内置 5×7 点阵画，⛔ 不依赖字体 —— 服务端（Node / Workers）没有字体文件。
 * 纯函数、零原生依赖；编码交给 `encodePng`。
 */
import type { RgbaImage } from '@/lib/image-pixels'
import type { ObjectReplaceAnnotation } from '@/types'

/** 官方给第一张图和标注层的像素上限。 */
export const OPENAI_MARKUP_MAX_PIXELS = 16_777_216

const STROKE = { r: 230, g: 38, b: 38 } as const
const LABEL_TEXT = { r: 255, g: 255, b: 255 } as const

/** 5×7 点阵，每行 5 位（高位在左）。 */
const DIGIT_GLYPHS: Record<string, readonly number[]> = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
}
const GLYPH_W = 5
const GLYPH_H = 7

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function fillRect(
  image: RgbaImage,
  left: number,
  top: number,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
) {
  const x0 = clamp(Math.round(left), 0, image.width)
  const y0 = clamp(Math.round(top), 0, image.height)
  const x1 = clamp(Math.round(left + width), 0, image.width)
  const y1 = clamp(Math.round(top + height), 0, image.height)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * image.width + x) * 4
      image.data[i] = color.r
      image.data[i + 1] = color.g
      image.data[i + 2] = color.b
      image.data[i + 3] = 255
    }
  }
}

/**
 * 画好的标注层（RGBA，未编码）。没有一个框带 `area`、或尺寸超官方上限 → `null`，
 * 调用方照旧只发文字清单（与其它模型同一条路）。
 */
export function renderObjectReplaceMarkup(
  annotations: readonly ObjectReplaceAnnotation[],
  width: number,
  height: number,
): RgbaImage | null {
  const boxes = annotations.filter(
    (
      annotation,
    ): annotation is ObjectReplaceAnnotation & {
      area: NonNullable<ObjectReplaceAnnotation['area']>
    } => annotation.area !== undefined,
  )
  if (boxes.length === 0) return null
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > OPENAI_MARKUP_MAX_PIXELS
  )
    return null

  // 全透明底（data 默认全 0 = alpha 0）。
  const image: RgbaImage = {
    width,
    height,
    data: new Uint8Array(width * height * 4),
  }
  const short = Math.min(width, height)
  const stroke = clamp(Math.round(short / 200), 3, 24)
  const scale = clamp(Math.round(short / 160), 2, 16)

  for (const box of boxes) {
    const left = box.area.x * width
    const top = box.area.y * height
    const boxW = Math.max(box.area.width * width, stroke * 2)
    const boxH = Math.max(box.area.height * height, stroke * 2)
    // 四条边。
    fillRect(image, left, top, boxW, stroke, STROKE)
    fillRect(image, left, top + boxH - stroke, boxW, stroke, STROKE)
    fillRect(image, left, top, stroke, boxH, STROKE)
    fillRect(image, left + boxW - stroke, top, stroke, boxH, STROKE)

    // 编号牌：放得下就贴在框外上沿，放不下（框贴着图顶）就收进框内左上角。
    const digits = String(box.index)
    const pad = scale * 2
    const labelW =
      digits.length * GLYPH_W * scale + (digits.length - 1) * scale + pad * 2
    const labelH = GLYPH_H * scale + pad * 2
    const labelLeft = clamp(left, 0, Math.max(0, width - labelW))
    const labelTop = top - labelH >= 0 ? top - labelH : top
    fillRect(image, labelLeft, labelTop, labelW, labelH, STROKE)
    digits.split('').forEach((digit, position) => {
      const glyph = DIGIT_GLYPHS[digit]
      if (!glyph) return
      const glyphLeft = labelLeft + pad + position * (GLYPH_W + 1) * scale
      glyph.forEach((row, rowIndex) => {
        for (let column = 0; column < GLYPH_W; column++) {
          if (row & (1 << (GLYPH_W - 1 - column))) {
            fillRect(
              image,
              glyphLeft + column * scale,
              labelTop + pad + rowIndex * scale,
              scale,
              scale,
              LABEL_TEXT,
            )
          }
        }
      })
    })
  }
  return image
}
