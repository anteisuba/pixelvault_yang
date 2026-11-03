import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  createCanvas,
  cropImage,
  decodeImage,
  drawImage,
  encodeJpeg,
  encodePng,
  fitImage,
  pasteImage,
  type RgbaImage,
} from './image-pixels'

/** 测试里用 sharp 当「对照组」造图和读图，被测代码本身不碰 sharp。 */
async function solid(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'webp' | 'gif',
  background = '#ff0000',
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } })
    [format]()
    .toBuffer()
}

function pixel(image: RgbaImage, x: number, y: number): number[] {
  const p = (y * image.width + x) * 4
  return [...image.data.subarray(p, p + 4)]
}

describe('decodeImage', () => {
  it.each(['png', 'jpeg', 'webp', 'gif'] as const)(
    '解开 %s',
    async (format) => {
      // 有损 webp 太小的图边上色偏大，用 32×24 才像真图。
      const image = decodeImage(await solid(32, 24, format))
      expect(image.width).toBe(32)
      expect(image.height).toBe(24)
      expect(image.data.length).toBe(32 * 24 * 4)
      expect(pixel(image, 16, 12)[0]).toBeGreaterThan(240)
    },
  )

  it('按 EXIF 转向摆正（6 = 顺时针 90°）', async () => {
    // 左半红、右半蓝的 4×2，标成转向 6：摆正后是 2×4，上半红、下半蓝。
    const raw = Buffer.alloc(4 * 2 * 3)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 4; x++) {
        const p = (y * 4 + x) * 3
        if (x < 2) raw[p] = 255
        else raw[p + 2] = 255
      }
    const jpeg = await sharp(raw, { raw: { width: 4, height: 2, channels: 3 } })
      .png()
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 100 })
      .toBuffer()
    const image = decodeImage(jpeg)
    expect([image.width, image.height]).toEqual([2, 4])
    expect(pixel(image, 0, 0)[0]).toBeGreaterThan(200)
    expect(pixel(image, 0, 3)[2]).toBeGreaterThan(200)
  })

  it('不支持的格式先挡住、不交给 wasm', async () => {
    const avif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#000' },
    })
      .avif()
      .toBuffer()
    expect(() => decodeImage(avif)).toThrow('Unsupported image format: avif')
    expect(() => decodeImage(Buffer.from('nope'))).toThrow()
  })
})

describe('encode', () => {
  it('PNG / JPEG 编出来别的库读得回', async () => {
    const canvas = createCanvas(5, 3, { r: 0, g: 128, b: 255 })
    const png = await sharp(encodePng(canvas)).metadata()
    const jpeg = await sharp(encodeJpeg(canvas, 80)).metadata()
    expect([png.format, png.width, png.height]).toEqual(['png', 5, 3])
    expect([jpeg.format, jpeg.width, jpeg.height]).toEqual(['jpeg', 5, 3])
  })
})

describe('fitImage', () => {
  const wide = (): RgbaImage => createCanvas(8, 4, { r: 255, g: 0, b: 0 })

  it('cover：铺满再居中裁，尺寸正好', () => {
    const out = fitImage(wide(), 4, 4, 'cover', { r: 0, g: 0, b: 0 })
    expect([out.width, out.height]).toEqual([4, 4])
    expect(pixel(out, 0, 0)).toEqual([255, 0, 0, 255])
  })

  it('contain：整张放进去，上下空出来的填底色', () => {
    const out = fitImage(wide(), 8, 8, 'contain', { r: 0, g: 0, b: 0 })
    expect([out.width, out.height]).toEqual([8, 8])
    expect(pixel(out, 4, 0)).toEqual([0, 0, 0, 255])
    expect(pixel(out, 4, 4)).toEqual([255, 0, 0, 255])
  })
})

describe('drawImage / pasteImage', () => {
  it('draw 按透明度叠，paste 连透明度原样盖；超出画布的部分丢掉', () => {
    const half: RgbaImage = {
      width: 2,
      height: 1,
      data: new Uint8Array([255, 255, 255, 128, 255, 255, 255, 0]),
    }
    const drawn = createCanvas(3, 1, { r: 0, g: 0, b: 0 })
    drawImage(drawn, half, 2, 0)
    expect(pixel(drawn, 2, 0)).toEqual([128, 128, 128, 255])

    const pasted = createCanvas(3, 1, { r: 0, g: 0, b: 0 })
    pasteImage(pasted, half, 1, 0)
    expect(pixel(pasted, 1, 0)).toEqual([255, 255, 255, 128])
    expect(pixel(pasted, 2, 0)).toEqual([255, 255, 255, 0])
    expect(pixel(pasted, 0, 0)).toEqual([0, 0, 0, 255])
  })

  it('crop 越界直接报错', () => {
    expect(() =>
      cropImage(createCanvas(2, 2, { r: 0, g: 0, b: 0 }), 1, 1, 2, 2),
    ).toThrow()
  })
})
