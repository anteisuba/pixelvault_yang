import 'server-only'

import sharp from 'sharp'

import { CHARACTER_OUTING_VIDEO } from '@/constants/character-browse'
import { logger } from '@/lib/logger'
import {
  bilibiliMediaHeaders,
  fetchBilibiliFrameSheet,
  fetchBilibiliMp4,
  type BilibiliVideoInfo,
} from '@/services/research/bilibili.connector'
import { fetchAsBuffer } from '@/services/storage/r2'

/**
 * **出门看视频的取材**（角色大项目第 ⑥ 步，owner 10-30）：只管把视频 / 分帧 / 封面拿到手，
 * ⛔ 调模型（那在 `character-browse.service.ts`，过额度表）。
 *
 * - B 站：360P mp4 下到内存（⛔ 存 R2），交给 Gemini；超大 / 取不到 → `null`，调用方退回分帧；
 * - B 站分帧：预览雪碧图按时间段挑格子，拼成一张图（看得了图的别家模型看这张）；
 * - YouTube：标题封面走 oEmbed（服务器打 YouTube 页面会被拦成验证页，oEmbed 不会）。
 */

/** Gemini 看这么多秒大概多少 token（按上限估：每帧 + 每秒声音）。 */
export function videoWatchTokens(seconds: number, fps: number): number {
  return Math.ceil(
    seconds *
      (fps * CHARACTER_OUTING_VIDEO.frameTokens +
        CHARACTER_OUTING_VIDEO.audioTokensPerSecond),
  )
}

/** 剩这么多 token 最多看几秒（够不上 `minWatchSeconds` → 0）。 */
export function affordableSeconds(tokens: number, fps: number): number {
  const seconds = Math.floor(tokens / videoWatchTokens(1, fps))
  return seconds >= CHARACTER_OUTING_VIDEO.minWatchSeconds ? seconds : 0
}

/** B 站 360P 下到内存，`data:` 交给 Gemini（大于 20MB 的由它那边自己走文件上传）。 */
export async function downloadBilibiliVideo(
  info: BilibiliVideoInfo,
): Promise<string | null> {
  try {
    const stream = await fetchBilibiliMp4(info.bvid, info.cid)
    if (!stream) return null
    if (stream.size && stream.size > CHARACTER_OUTING_VIDEO.bilibiliMaxBytes)
      return null
    const { buffer, mimeType } = await fetchAsBuffer(stream.url, {
      headers: bilibiliMediaHeaders(),
      maxBytes: CHARACTER_OUTING_VIDEO.bilibiliMaxBytes,
      signal: AbortSignal.timeout(CHARACTER_OUTING_VIDEO.downloadTimeoutMs),
    })
    const type = mimeType.startsWith('video/') ? mimeType : 'video/mp4'
    return `data:${type.split(';')[0]};base64,${buffer.toString('base64')}`
  } catch (error) {
    logger.info('character outing bilibili video not downloaded', {
      bvid: info.bvid,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/** 在 `[start, end]` 里均匀挑最多 `count` 个下标。 */
export function pickFrames(
  times: readonly number[],
  count: number,
  start = 0,
  end = Number.POSITIVE_INFINITY,
): number[] {
  const inside = times
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time >= start && time <= end)
    .map(({ index }) => index)
  if (inside.length <= count) return inside
  return Array.from(
    { length: count },
    (_, n) => inside[Math.floor((n * inside.length) / count)]!,
  )
}

/**
 * B 站分帧拼一张图（第 ⑥ 步：别家模型「看视频」= 看这张）：按时间段挑最多 `frameTiles` 格，
 * 每行 `frameColumns` 格，从左到右、从上到下是时间顺序。取不到 → `null`。
 */
export async function bilibiliFramePicture(
  bvid: string,
  range: { start?: number; end?: number } = {},
): Promise<string | null> {
  try {
    const sheet = await fetchBilibiliFrameSheet(bvid)
    if (!sheet) return null
    const perImage = sheet.columns * sheet.rows
    const total = Math.min(sheet.times.length, sheet.images.length * perImage)
    const picks = pickFrames(
      sheet.times.slice(0, total),
      CHARACTER_OUTING_VIDEO.frameTiles,
      range.start,
      range.end,
    )
    if (!picks.length) return null
    const sources = new Map<number, Buffer>()
    for (const imageIndex of new Set(
      picks.map((pick) => Math.floor(pick / perImage)),
    )) {
      const { buffer } = await fetchAsBuffer(sheet.images[imageIndex]!, {
        headers: bilibiliMediaHeaders(),
        maxBytes: 4 * 1024 * 1024,
        signal: AbortSignal.timeout(15_000),
      })
      sources.set(imageIndex, buffer)
    }
    const tiles = await Promise.all(
      picks.map(async (pick) => {
        const cell = pick % perImage
        return sharp(sources.get(Math.floor(pick / perImage)))
          .extract({
            left: (cell % sheet.columns) * sheet.width,
            top: Math.floor(cell / sheet.columns) * sheet.height,
            width: sheet.width,
            height: sheet.height,
          })
          .toBuffer()
      }),
    )
    const columns = Math.min(CHARACTER_OUTING_VIDEO.frameColumns, tiles.length)
    const rows = Math.ceil(tiles.length / columns)
    const grid = await sharp({
      create: {
        width: columns * sheet.width,
        height: rows * sheet.height,
        channels: 3,
        background: '#000000',
      },
    })
      .composite(
        tiles.map((input, n) => ({
          input,
          left: (n % columns) * sheet.width,
          top: Math.floor(n / columns) * sheet.height,
        })),
      )
      .jpeg({ quality: 80 })
      .toBuffer()
    return `data:image/jpeg;base64,${grid.toString('base64')}`
  } catch (error) {
    logger.info('character outing bilibili frames not built', {
      bvid,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/** YouTube 视频 id → 封面（不经 YouTube 页面，服务器也拿得到）。 */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

/** YouTube 标题、频道（oEmbed）。拿不到 → `null`。 */
export async function youtubeOembed(
  url: string,
): Promise<{ title: string; author: string | null } | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      title?: unknown
      author_name?: unknown
    }
    return typeof data.title === 'string'
      ? {
          title: data.title,
          author:
            typeof data.author_name === 'string' ? data.author_name : null,
        }
      : null
  } catch {
    return null
  }
}
