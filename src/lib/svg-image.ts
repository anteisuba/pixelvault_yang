/**
 * GPT Image 2.5 / 2.6 的 SVG 输出（`output_format: "svg"`）在这里收口：清洗、
 * 读尺寸、判断一条 URL / MIME 是不是 SVG。
 *
 * ⚠ 本文件被 worker（`workers/execution`）按相对路径直接引用 —— ⛔ 不要加 `@/`
 * 别名导入或任何 Node 依赖。
 *
 * 为什么必须清洗：SVG 是可执行文档。`<img>` 里显示是安全的，但被人在新标签页里
 * 直接打开 CDN 地址时，里面的 `<script>` / `onload=` 会在 CDN 源上跑。模型产出
 * 的 SVG 不可信，所以入库前按**白名单**重写：不认识的元素连同内容一起丢，事件
 * 属性丢，外链丢。worker 另外给对象挂 `Content-Disposition: attachment`，直接
 * 打开只会下载 —— 两道各自独立。
 */

export const SVG_MIME_TYPE = 'image/svg+xml'

export function isSvgMimeType(mimeType: string | null | undefined): boolean {
  return (mimeType ?? '').toLowerCase().split(';')[0].trim() === SVG_MIME_TYPE
}

/** 我们自己存的 SVG 一律以 `.svg` 结尾；外部 data URL 看 MIME 头。 */
export function isSvgImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (/^data:image\/svg\+xml[;,]/i.test(url)) return true
  try {
    return /\.svg$/i.test(new URL(url, 'https://local.invalid').pathname)
  } catch {
    return false
  }
}

/** `image/svg+xml` → `svg`，其余取 `/` 后半段（`image/png` → `png`）。 */
export function fileExtensionForMime(mimeType: string | null | undefined) {
  if (isSvgMimeType(mimeType)) return 'svg'
  const sub = (mimeType ?? '').split('/')[1]?.split(';')[0]?.trim()
  if (!sub) return 'png'
  return sub === 'jpeg' ? 'jpg' : sub
}

export class UnsafeSvgError extends Error {
  constructor(reason: string) {
    super(`Generated SVG rejected: ${reason}`)
    this.name = 'UnsafeSvgError'
  }
}

/** 静态矢量图需要的元素。⛔ 别加 `foreignObject` / `script` / `a` / 动画元素。 */
const ALLOWED_ELEMENTS = new Set(
  [
    'svg',
    'g',
    'defs',
    'symbol',
    'use',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'textPath',
    'title',
    'desc',
    'metadata',
    'style',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'pattern',
    'marker',
    'image',
    'filter',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feDistantLight',
    'feDropShadow',
    'feFlood',
    'feFuncA',
    'feFuncB',
    'feFuncG',
    'feFuncR',
    'feGaussianBlur',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feOffset',
    'fePointLight',
    'feSpecularLighting',
    'feSpotLight',
    'feTile',
    'feTurbulence',
  ].map((name) => name.toLowerCase()),
)

/** 只拆标签、保留子内容的元素（链接本身没用，里面的图形要留）。 */
const UNWRAPPED_ELEMENTS = new Set(['a'])

const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i
const DANGEROUS_CSS =
  /@import|url\(\s*['"]?\s*(?!#)|javascript:|expression\s*\(/i
const DANGEROUS_VALUE =
  /(?:java|vb)script:|data:(?!image\/(?:png|jpe?g|gif|webp);base64,)/i

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>|<\?[\s\S]*?\?>|<\/?[A-Za-z][^>]*>|[^<]+|</gi
const TAG = /^<(\/?)([A-Za-z][\w:.-]*)([\s\S]*?)(\/?)>$/
const ATTR = /([^\s=/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&colon;/gi, ':')
    .split('')
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join('')
}

function localName(name: string): string {
  const parts = name.split(':')
  return parts[parts.length - 1].toLowerCase()
}

function sanitizeAttributes(element: string, raw: string): string {
  let out = ''
  for (const match of raw.matchAll(ATTR)) {
    const name = match[1]
    const quoted = match[2]
    const lower = name.toLowerCase()
    if (lower.startsWith('on')) continue
    if (quoted === undefined) continue
    const value =
      quoted.startsWith('"') || quoted.startsWith("'")
        ? quoted.slice(1, -1)
        : quoted
    const decoded = decodeEntities(value)
    if (localName(lower) === 'href') {
      const ok =
        decoded.startsWith('#') ||
        (element === 'image' && SAFE_DATA_IMAGE.test(decoded))
      if (!ok) continue
    } else if (DANGEROUS_VALUE.test(decoded)) {
      continue
    }
    if (lower === 'style' && DANGEROUS_CSS.test(decoded)) continue
    if (/url\(\s*['"]?\s*(?!#)/i.test(decoded)) continue
    out += ` ${name}="${value.replace(/"/g, '&quot;')}"`
  }
  return out
}

/**
 * 按白名单重写模型产出的 SVG。结果仍是合法 SVG 文本；任何一处不安全的东西
 * 被丢掉；根元素不是 `<svg>` 或带内部实体定义则抛 `UnsafeSvgError`。
 */
export function sanitizeGeneratedSvg(source: string): string {
  if (/<!DOCTYPE[^>]*\[/i.test(source) || /<!ENTITY/i.test(source)) {
    throw new UnsafeSvgError('internal DTD / entity declarations')
  }

  const stack: Array<{ name: string; dropped: boolean; unwrapped: boolean }> =
    []
  const insideDropped = () => stack.some((entry) => entry.dropped)
  const insideStyle = () => stack.at(-1)?.name === 'style'
  let out = ''
  let sawRoot = false

  for (const [token] of source.matchAll(TOKEN)) {
    if (token.startsWith('<!--') || /^<!DOCTYPE/i.test(token)) continue
    if (token.startsWith('<?')) {
      if (/^<\?xml\s/i.test(token) && !sawRoot && !out) out += token
      continue
    }
    if (token.startsWith('<![CDATA[')) {
      if (insideDropped()) continue
      // 样式里有外链 / @import：整段丢掉（图会少些样式，但不会外连）。
      if (insideStyle() && DANGEROUS_CSS.test(token)) continue
      out += token
      continue
    }
    const tag = TAG.exec(token)
    if (!tag) {
      // 文本节点（或孤立的 `<`）。
      if (insideDropped()) continue
      if (insideStyle() && DANGEROUS_CSS.test(token)) continue
      out += token === '<' ? '&lt;' : token
      continue
    }

    const [, closing, rawName, rawAttrs, selfClosing] = tag
    const name = localName(rawName)

    if (closing) {
      let index = stack.length - 1
      while (index >= 0 && stack[index].name !== name) index--
      if (index === -1) continue
      const [entry] = stack.splice(index).slice(0, 1)
      if (!entry.dropped && !entry.unwrapped && !insideDropped()) {
        out += `</${rawName}>`
      }
      continue
    }

    const unwrapped = UNWRAPPED_ELEMENTS.has(name)
    const dropped = !unwrapped && !ALLOWED_ELEMENTS.has(name)
    if (!sawRoot) {
      if (name !== 'svg') throw new UnsafeSvgError('root element is not <svg>')
      sawRoot = true
    }
    const emit = !dropped && !unwrapped && !insideDropped()
    if (emit) {
      out += `<${rawName}${sanitizeAttributes(name, rawAttrs)}${selfClosing ? '/' : ''}>`
    }
    if (!selfClosing) stack.push({ name, dropped, unwrapped })
  }

  if (!sawRoot) throw new UnsafeSvgError('no <svg> element')
  return out
}

const MAX_SVG_EDGE = 16_384

function parseLength(value: string | undefined): number | null {
  if (!value) return null
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(value)
  if (!match) return null
  const n = Number.parseFloat(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * 根 `<svg>` 的显示尺寸：先认 `width` / `height`（无单位或 px），缺一边按
 * `viewBox` 的宽高比补，都没有就整个取 `viewBox`。读不出返回 null（调用方
 * 回退到请求尺寸）。
 */
export function readSvgDimensions(
  svg: string,
): { width: number; height: number } | null {
  const root = /<svg\b([^>]*)>/i.exec(svg)
  if (!root) return null
  const attrs = new Map<string, string>()
  for (const match of root[1].matchAll(ATTR)) {
    if (match[2] === undefined) continue
    attrs.set(match[1].toLowerCase(), match[2].replace(/^["']|["']$/g, ''))
  }
  const viewBox = attrs
    .get('viewbox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const vbWidth = viewBox?.length === 4 && viewBox[2] > 0 ? viewBox[2] : null
  const vbHeight = viewBox?.length === 4 && viewBox[3] > 0 ? viewBox[3] : null

  let width = parseLength(attrs.get('width'))
  let height = parseLength(attrs.get('height'))
  if (width && !height && vbWidth && vbHeight)
    height = (width * vbHeight) / vbWidth
  if (height && !width && vbWidth && vbHeight)
    width = (height * vbWidth) / vbHeight
  width ??= vbWidth
  height ??= vbHeight
  if (!width || !height) return null

  const clamp = (n: number) =>
    Math.min(MAX_SVG_EDGE, Math.max(1, Math.round(n)))
  return { width: clamp(width), height: clamp(height) }
}
