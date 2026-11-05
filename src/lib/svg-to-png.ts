/**
 * SVG 作品 → PNG（浏览器端渲染）。owner 2026-11-05 定：转 PNG 存成一张新作品，
 * SVG 原件保留；长边三档 1024 / 2048 / 4096。
 *
 * 为什么在浏览器里画：服务端没有 SVG 光栅化器（缩略图管线只吃位图，app 侧的
 * `image-pixels` 也只解 png/jpeg/webp/gif），而浏览器本来就会画 SVG。
 *
 * ⚠ 读像素要匿名 CORS：CDN 的允许名单含正式域与 localhost，**不含预览部署**
 * （见 `lib/video-frame-capture.ts` 的实测说明）——那里 `fetch` 会失败，按普通
 * 失败报给用户。
 */

import { readSvgDimensions } from '@/lib/svg-image'

export const SVG_TO_PNG_LONG_EDGES = [1024, 2048, 4096] as const
export type SvgToPngLongEdge = (typeof SVG_TO_PNG_LONG_EDGES)[number]
export const SVG_TO_PNG_DEFAULT_LONG_EDGE: SvgToPngLongEdge = 2048

/** 按长边等比算目标像素（短边至少 1）。 */
export function svgRasterSize(
  source: { width: number; height: number },
  longEdge: number,
): { width: number; height: number } {
  const w = Math.max(1, source.width)
  const h = Math.max(1, source.height)
  const scale = longEdge / Math.max(w, h)
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

/**
 * 把根 `<svg>` 的 width / height 改成目标像素（保留 viewBox 不动）。没有
 * viewBox 时按原 width / height 补一个，否则放大后只会裁出左上角。
 */
export function resizeSvgDocument(
  svgText: string,
  target: { width: number; height: number },
): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror'))
    throw new Error('not a valid SVG document')
  if (!root.getAttribute('viewBox')) {
    const w = Number.parseFloat(root.getAttribute('width') ?? '')
    const h = Number.parseFloat(root.getAttribute('height') ?? '')
    if (w > 0 && h > 0) root.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  root.setAttribute('width', String(target.width))
  root.setAttribute('height', String(target.height))
  return new XMLSerializer().serializeToString(doc)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('SVG could not be rendered'))
    image.src = url
  })
}

/**
 * 读 CDN 上的 SVG，按长边画成 PNG 文件。宽高比从 SVG 自己的
 * width / height / viewBox 读（与入库时同一个函数），读不出按正方形。
 */
export async function rasterizeSvgUrlToPng(params: {
  url: string
  longEdge: SvgToPngLongEdge
  baseName: string
}): Promise<File> {
  const response = await fetch(params.url, {
    mode: 'cors',
    credentials: 'omit',
  })
  if (!response.ok) throw new Error(`SVG fetch failed (${response.status})`)
  const text = await response.text()
  const source = readSvgDimensions(text) ?? { width: 1, height: 1 }
  const target = svgRasterSize(source, params.longEdge)
  const resized = resizeSvgDocument(text, target)

  const objectUrl = URL.createObjectURL(
    new Blob([resized], { type: 'image/svg+xml' }),
  )
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas 2d context unavailable')
    context.drawImage(image, 0, 0, target.width, target.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('toBlob failed')),
        'image/png',
      ),
    )
    return new File([blob], `${params.baseName}-${params.longEdge}.png`, {
      type: 'image/png',
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
