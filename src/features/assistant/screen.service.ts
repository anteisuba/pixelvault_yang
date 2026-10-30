import 'server-only'

import { createHash } from 'node:crypto'

import sharp, { type OverlayOptions } from 'sharp'

import { CHUB_LIBRARY } from '@/constants/cards/chub-library'
import { logger } from '@/lib/logger'
import type { AssistantLibraryView } from '@/types/assistant-operator'
import type { AssistantV3PictureRef } from '@/types/assistant-v3'
import {
  fetchAsBuffer,
  isOwnedStorageUrl,
  uploadToR2,
} from '@/services/storage/r2'
import { ASSISTANT_NEXT_HANDLE_PREFIXES as PREFIX } from '@/features/assistant/constants'
import {
  LIBRARY_VIEW_LABELS,
  libraryHandle,
  libraryKindOpens,
} from '@/features/assistant/library-view'

/**
 * 「看屏」（owner 10-30「像 Claude in Chrome 那样看见页面」，方向 B：结构 + 按需看屏）。
 *
 * ⭐ `look 屏幕` = 把你眼前那一屏的缩略图**按它们在屏上的位置**拼成一张、每格角上标号，一次摆给
 *   模型 —— 先看个大概，要细看再按编号 look 单张（owner 10-30「先看个大概，然后可以细看」）。
 *   拼成一张而不是一张张附：20 张分开发要贵约 20 倍，还超过一次 look 的张数上限。
 * ⛔ 不截网页：图都在别的域上，浏览器里截图常是空白；这里由服务端照报上来的地址去拿。
 * ⚠ 地址只认白名单里的图床（`isScreenThumbAllowed`）：报屏的是浏览器，⛔ 跟着任意地址去取。
 * ⚠ 小样图存 R2（同一屏同一个键，重看不重拼）：look 的图只记地址，下一步按地址再下一次。
 */

const SHEET = {
  /** 小样图宽（像素）；高按视口比例，裁到格子占的那一段。 */
  width: 1280,
  maxHeight: 2000,
  /** 没报位置时退回网格：每排几格、每格多大。 */
  gridColumns: 5,
  gridCell: 240,
  gridGap: 8,
  /** 角标直径。 */
  badge: 34,
  margin: 12,
  /** 一张缩略图最多多少字节。 */
  maxThumbBytes: 20 * 1024 * 1024,
  quality: 80,
  background: { r: 24, g: 24, b: 27 },
  keyPrefix: 'assistant-screens',
} as const

function civitaiProxyHost(): string | null {
  const base = process.env.NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE
  if (!base) return null
  try {
    return new URL(base).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** 屏上缩略图从哪几处拿：自己的图床、Civitai（及其代理）、chub 卡图、Danbooru 图床。 */
export function isScreenThumbAllowed(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  if (isOwnedStorageUrl(url)) return true
  const host = parsed.hostname.toLowerCase()
  if (host === 'image.civitai.com' || host === civitaiProxyHost()) return true
  return [...CHUB_LIBRARY.IMAGE_HOST_SUFFIXES, 'donmai.us'].some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

type Screen = NonNullable<AssistantLibraryView['screen']>

interface Placed {
  readonly index: number
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** 每格摆在哪：报了位置就照位置（裁到格子占的那一段），没报就排成网格。 */
function layout(
  screen: Screen,
  indexes: readonly number[],
): { width: number; height: number; placed: Placed[] } {
  const boxes = indexes.map((index) => screen.tiles?.[index]?.box)
  if (boxes.every(Boolean) && screen.viewport) {
    const scale = SHEET.width / screen.viewport.width
    const fullHeight = screen.viewport.height * scale
    const top = Math.min(...boxes.map((box) => box![1])) * fullHeight
    const bottom =
      Math.max(...boxes.map((box) => box![1] + box![3])) * fullHeight
    const offset = Math.max(0, top - SHEET.margin)
    const height = Math.min(
      SHEET.maxHeight,
      Math.max(SHEET.badge * 2, Math.round(bottom - offset + SHEET.margin)),
    )
    const placed = indexes.flatMap((index, order) => {
      const [x, y, w, h] = boxes[order]!
      const left = Math.round(x * SHEET.width)
      const tileTop = Math.round(y * fullHeight - offset)
      const width = Math.min(SHEET.width - left, Math.round(w * SHEET.width))
      const tileHeight = Math.min(height - tileTop, Math.round(h * fullHeight))
      return width >= 8 && tileHeight >= 8 && tileTop >= 0
        ? [{ index, left, top: tileTop, width, height: tileHeight }]
        : []
    })
    return { width: SHEET.width, height, placed }
  }
  const step = SHEET.gridCell + SHEET.gridGap
  const rows = Math.ceil(indexes.length / SHEET.gridColumns)
  return {
    width: SHEET.gridColumns * step - SHEET.gridGap,
    height: Math.max(1, rows * step - SHEET.gridGap),
    placed: indexes.map((index, order) => ({
      index,
      left: (order % SHEET.gridColumns) * step,
      top: Math.floor(order / SHEET.gridColumns) * step,
      width: SHEET.gridCell,
      height: SHEET.gridCell,
    })),
  }
}

/**
 * 七段数码的笔画（a 上 · b 右上 · c 右下 · d 下 · e 左下 · f 左上 · g 中）。
 * ⚠ 角标数字用线段画、⛔ 不用 `<text>`：服务器上不一定装了字体，没字体时 SVG 的字整个不出来。
 */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
}

function digitPath(digit: string, x: number, y: number): string {
  const w = 8
  const h = 7
  const lines: Record<string, [number, number, number, number]> = {
    a: [0, 0, w, 0],
    b: [w, 0, w, h],
    c: [w, h, w, h * 2],
    d: [0, h * 2, w, h * 2],
    e: [0, h, 0, h * 2],
    f: [0, 0, 0, h],
    g: [0, h, w, h],
  }
  return [...(SEGMENTS[digit] ?? '')]
    .map((segment) => {
      const [x1, y1, x2, y2] = lines[segment]!
      return `M${x + x1} ${y + y1}L${x + x2} ${y + y2}`
    })
    .join('')
}

function badgeSvg(label: string): Buffer {
  const size = SHEET.badge
  const digitWidth = 8
  const gap = 4
  const total = label.length * digitWidth + (label.length - 1) * gap
  const left = (size - total) / 2
  const top = (size - 14) / 2
  const path = [...label]
    .map((digit, index) =>
      digitPath(digit, left + index * (digitWidth + gap), top),
    )
    .join('')
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#111" stroke="#fff" stroke-width="2"/><path d="${path}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>`,
  )
}

async function loadThumb(
  url: string,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  try {
    const { buffer } = await fetchAsBuffer(url, {
      maxBytes: SHEET.maxThumbBytes,
      signal,
    })
    return buffer
  } catch {
    return null
  }
}

interface SheetCell {
  readonly index: number
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly buffer: Buffer
  readonly badge: string
  /** 库格子照屏上裁（`cover`）；台上的图要看全貌（`contain`）。 */
  readonly fit: 'cover' | 'contain'
  /** 台上选中的那张：描一圈白边。 */
  readonly highlight?: boolean
}

/** 把摆好的格子画成一张 JPEG 存 R2：回地址与真画上去的那几格（解不开的跳过）。 */
async function renderSheet(input: {
  userId: string
  width: number
  height: number
  cells: readonly SheetCell[]
  seed: unknown
}): Promise<{ url: string | null; drawn: number[] }> {
  const { width, height } = input
  const composites: OverlayOptions[] = []
  const drawn: number[] = []
  for (const cell of input.cells) {
    try {
      const tile = await sharp(cell.buffer, { animated: false })
        .resize(cell.width, cell.height, {
          fit: cell.fit,
          background: { ...SHEET.background, alpha: 1 },
        })
        .flatten({ background: SHEET.background })
        .jpeg({ quality: 90 })
        .toBuffer()
      composites.push({ input: tile, left: cell.left, top: cell.top })
      if (cell.highlight)
        composites.push({
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${cell.width}" height="${cell.height}"><rect x="2" y="2" width="${cell.width - 4}" height="${cell.height - 4}" fill="none" stroke="#fff" stroke-width="4"/></svg>`,
          ),
          left: cell.left,
          top: cell.top,
        })
      composites.push({
        input: badgeSvg(cell.badge),
        left: Math.min(cell.left + 6, width - SHEET.badge),
        top: Math.min(cell.top + 6, height - SHEET.badge),
      })
      drawn.push(cell.index)
    } catch {
      // 格式解不开（视频、坏图）：这一格不画，号照样在文字那行里。
    }
  }
  if (drawn.length === 0) return { url: null, drawn }
  try {
    const sheet = await sharp({
      create: { width, height, channels: 3, background: SHEET.background },
    })
      .composite(composites)
      .jpeg({ quality: SHEET.quality })
      .toBuffer()
    const key = `${SHEET.keyPrefix}/${input.userId}/${createHash('sha256')
      .update(
        JSON.stringify({
          width,
          height,
          cells: input.cells.map((cell) => [
            cell.index,
            cell.left,
            cell.top,
            cell.width,
            cell.height,
            cell.fit,
            cell.highlight ?? false,
          ]),
          seed: input.seed,
        }),
      )
      .digest('hex')
      .slice(0, 32)}.jpg`
    return {
      url: await uploadToR2({ data: sheet, key, mimeType: 'image/jpeg' }),
      drawn,
    }
  } catch (error) {
    logger.warn('Assistant screen sheet failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { url: null, drawn: [] }
  }
}

/** 台上的一张图：编号（`ref-1` / `result-2`）、地址、选中没有。 */
export interface BenchScreenPicture {
  readonly name: string
  readonly url: string
  readonly label?: string
  readonly selected?: boolean
}

/**
 * 台上的「看屏」（owner 10-30「把整个台（参考图 + 结果）一起拼」）：上面一排参考图、下面结果，
 * 每张看全貌（不裁）、角上标号，选中的那张描白边 —— 一眼看完台上所有图，要细看再 look 单张。
 * ⚠ 地址来自台上的快照（与 `look ref-N / result-N` 同一份），由 `fetchAsBuffer` 防 SSRF 去取。
 */
export async function buildBenchScreenSheet(input: {
  userId: string
  references: readonly BenchScreenPicture[]
  results: readonly BenchScreenPicture[]
  signal?: AbortSignal
}): Promise<ScreenSheet> {
  const all = [...input.references, ...input.results]
  if (all.length === 0)
    return {
      text: `${PREFIX.screen}: there are no pictures on the bench — no references mounted and no results yet. Read the form with look (no names).`,
      picture: null,
    }
  const describe = (picture: BenchScreenPicture, index: number) =>
    `${index + 1} = ${picture.name}${picture.label ? ` ${picture.label}` : ''}${picture.selected ? ' (selected — "this one")' : ''}`
  const legend = `${all.map(describe).join(' · ')}.`
  const buffers = await Promise.all(
    all.map((picture) => loadThumb(picture.url, input.signal)),
  )
  const step = SHEET.gridCell + SHEET.gridGap
  const sectionGap = SHEET.gridGap * 4
  const rowsOf = (count: number) => Math.ceil(count / SHEET.gridColumns)
  const referenceRows = rowsOf(input.references.length)
  const resultTop =
    referenceRows * step +
    (referenceRows && input.results.length ? sectionGap : 0)
  const columns = Math.min(
    SHEET.gridColumns,
    Math.max(input.references.length, input.results.length),
  )
  const width = columns * step - SHEET.gridGap
  const height = Math.max(
    1,
    resultTop + rowsOf(input.results.length) * step - SHEET.gridGap,
  )
  const cells: SheetCell[] = all.flatMap((picture, index) => {
    const buffer = buffers[index]
    if (!buffer) return []
    const isResult = index >= input.references.length
    const order = isResult ? index - input.references.length : index
    return [
      {
        index,
        left: (order % SHEET.gridColumns) * step,
        top:
          (isResult ? resultTop : 0) +
          Math.floor(order / SHEET.gridColumns) * step,
        width: SHEET.gridCell,
        height: SHEET.gridCell,
        buffer,
        badge: String(index + 1),
        fit: 'contain',
        highlight: picture.selected,
      },
    ]
  })
  const rendered = await renderSheet({
    userId: input.userId,
    width,
    height,
    cells,
    seed: all.map((picture) => picture.url),
  })
  const missing = all
    .map((_, index) => index)
    .filter((index) => !rendered.drawn.includes(index))
    .map((index) => String(index + 1))
  const noteMissing = missing.length
    ? ` Not drawn (could not load): ${missing.join(', ')}.`
    : ''
  const rows = [
    input.references.length ? 'the top row is their reference pictures' : '',
    input.results.length
      ? `${input.references.length ? 'below it' : 'the rows'} are the latest results`
      : '',
  ]
    .filter(Boolean)
    .join(', ')
  if (!rendered.url)
    return {
      text: `${PREFIX.screen}: the picture of the bench could not be made this time. On the bench: ${legend} Look them by name instead.`,
      picture: null,
    }
  return {
    text: `${PREFIX.screen} — the bench as one picture: ${rows}; each shown whole with its number in the corner${input.results.some((picture) => picture.selected) ? ', the selected result framed in white' : ''}. ${legend}${noteMissing} Talk about them the way they see them (by position or by what is in them). To see one big, look it by its name (ref-N / result-N).`,
    picture: { url: rendered.url, label: PREFIX.screen },
  }
}

export interface ScreenSheet {
  readonly text: string
  readonly picture: AssistantV3PictureRef | null
}

/** `look 屏幕`：拼好小样图并说清每个号是谁；库没开 / 屏上没东西就只回一句话。 */
export async function buildScreenSheet(input: {
  userId: string
  view: AssistantLibraryView | undefined
  signal?: AbortSignal
}): Promise<ScreenSheet> {
  const { view } = input
  if (!view)
    return {
      text: `${PREFIX.screen}: no library is open — what they see is the bench itself; read it with look (no names) and look result-N / ref-N for its pictures.`,
      picture: null,
    }
  const screen = view.screen
  if (!screen?.visible.length)
    return {
      text: `${PREFIX.screen}: their ${LIBRARY_VIEW_LABELS[view.library]} is open, but nothing is on screen right now.`,
      picture: null,
    }
  const names = screen.visible.map((name) => libraryHandle(screen.kind, name))
  const legend = `${names.map((name, index) => `${index + 1} = ${name}`).join(' · ')}.`
  const withThumb = screen.visible.flatMap((_, index) => {
    const thumb = screen.tiles?.[index]?.thumb
    return thumb && isScreenThumbAllowed(thumb) ? [index] : []
  })
  const openHint = libraryKindOpens(screen.kind)
    ? ' To see one big with its full recipe / details, look it by its name.'
    : ''
  if (withThumb.length === 0)
    return {
      text: `${PREFIX.screen} — their ${LIBRARY_VIEW_LABELS[view.library]}, top-left first (these tiles have no pictures): ${legend}${openHint}`,
      picture: null,
    }

  const thumbs = await Promise.all(
    withThumb.map((index) =>
      loadThumb(screen.tiles![index]!.thumb!, input.signal),
    ),
  )
  const loaded = withThumb.filter((_, order) => thumbs[order])
  const { width, height, placed } = layout(screen, loaded)
  const cells: SheetCell[] = placed.flatMap((place) => {
    const buffer = thumbs[withThumb.indexOf(place.index)]
    return buffer
      ? [{ ...place, buffer, badge: String(place.index + 1), fit: 'cover' }]
      : []
  })
  const rendered = await renderSheet({
    userId: input.userId,
    width,
    height,
    cells,
    seed: loaded.map((index) => screen.tiles![index]!.thumb),
  })
  const drawn = rendered.drawn
  const missing = screen.visible
    .map((_, index) => index)
    .filter((index) => !drawn.includes(index))
    .map((index) => String(index + 1))
  const noteMissing = missing.length
    ? ` Not drawn (no picture or could not load): ${missing.join(', ')}.`
    : ''
  if (drawn.length === 0)
    return {
      text: `${PREFIX.screen} — their ${LIBRARY_VIEW_LABELS[view.library]}, top-left first; none of the pictures could be loaded: ${legend}${openHint}`,
      picture: null,
    }

  if (!rendered.url)
    return {
      text: `${PREFIX.screen}: the picture of their screen could not be made this time. Top-left first: ${legend}${openHint}`,
      picture: null,
    }
  return {
    text: `${PREFIX.screen} — their ${LIBRARY_VIEW_LABELS[view.library]} as they see it right now: the picture shows each tile where it sits on their screen, with its number in the corner. ${legend}${noteMissing} Talk about them the way they see them (by position or by what is in them), not by these numbers or names.${openHint}`,
    picture: { url: rendered.url, label: PREFIX.screen },
  }
}
