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
  maxThumbBytes: 8 * 1024 * 1024,
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
  const composites: OverlayOptions[] = []
  const drawn: number[] = []
  for (const place of placed) {
    const buffer = thumbs[withThumb.indexOf(place.index)]
    if (!buffer) continue
    try {
      const tile = await sharp(buffer, { animated: false })
        .resize(place.width, place.height, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toBuffer()
      composites.push({ input: tile, left: place.left, top: place.top })
      composites.push({
        input: badgeSvg(String(place.index + 1)),
        left: Math.min(place.left + 6, width - SHEET.badge),
        top: Math.min(place.top + 6, height - SHEET.badge),
      })
      drawn.push(place.index)
    } catch {
      // 格式解不开（视频、坏图）：这一格不画，号照样在下面那行里。
    }
  }
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
          placed,
          thumbs: loaded.map((index) => screen.tiles![index]!.thumb),
        }),
      )
      .digest('hex')
      .slice(0, 32)}.jpg`
    const url = await uploadToR2({ data: sheet, key, mimeType: 'image/jpeg' })
    return {
      text: `${PREFIX.screen} — their ${LIBRARY_VIEW_LABELS[view.library]} as they see it right now: the picture shows each tile where it sits on their screen, with its number in the corner. ${legend}${noteMissing} Talk about them the way they see them (by position or by what is in them), not by these numbers or names.${openHint}`,
      picture: { url, label: PREFIX.screen },
    }
  } catch (error) {
    logger.warn('Assistant screen sheet failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      text: `${PREFIX.screen}: the picture of their screen could not be made this time. Top-left first: ${legend}${openHint}`,
      picture: null,
    }
  }
}
