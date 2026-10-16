/**
 * 一条**找到的视频**：哪个平台、能不能在面板里播（嵌入地址）、时长怎么读写。
 *
 * ⭐ 判别只此一处（搜索期第二片，附录 I §四）：服务端拿它定 `platform`（模型那一行、
 *   面板的平台标都读它），面板拿它算嵌入地址 —— 同一个函数，两边不会各判各的。
 * 纯函数、无 IO：⛔ 不跟短链跳转（`b23.tv` 认得出是 B站、认不出稿件号 → 新窗口）。
 */

import { RESEARCH_LIMITS } from '@/constants/research'
import {
  WEB_VIDEO_EMBED,
  WEB_VIDEO_ID_PATTERNS,
  WEB_VIDEO_PLATFORM_HOSTS,
  WEB_VIDEO_PLATFORM_IDS,
  type WebVideoPlatform,
} from '@/constants/web-video'
import { extractYoutubeVideoId } from '@/lib/video-link'

export interface WebVideoTarget {
  platform: WebVideoPlatform
  /** 官方嵌入播放器的地址；`null` = 这一条只能新窗口打开源页。 */
  embedUrl: string | null
}

const OTHER: WebVideoTarget = {
  platform: WEB_VIDEO_PLATFORM_IDS.other,
  embedUrl: null,
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function hostMatches(host: string, bases: readonly string[]): boolean {
  return bases.some((base) => host === base || host.endsWith(`.${base}`))
}

function segmentsOf(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean)
}

/** `?p=2` 这种分 P 号：正整数才带，⛔ 别的原样丢掉。 */
function positiveIntParam(url: URL, name: string): number | null {
  const value = url.searchParams.get(name)
  if (!value || !/^\d{1,4}$/.test(value)) return null
  const parsed = Number(value)
  return parsed > 0 ? parsed : null
}

function youtubeTarget(url: URL): WebVideoTarget {
  const id = extractYoutubeVideoId(url)
  return {
    platform: WEB_VIDEO_PLATFORM_IDS.youtube,
    embedUrl: id ? `${WEB_VIDEO_EMBED.youtubePrefix}${id}` : null,
  }
}

function bilibiliTarget(url: URL): WebVideoTarget {
  const segments = segmentsOf(url)
  const videoIndex = segments.indexOf('video')
  // 合集 / 稍后再看 / 活动页（`/list/…?bvid=`）的稿件号在查询串里。
  const id =
    videoIndex >= 0
      ? segments[videoIndex + 1]
      : (url.searchParams.get('bvid') ?? undefined)
  const params = new URLSearchParams()
  const aid = id ? WEB_VIDEO_ID_PATTERNS.bilibiliAid.exec(id)?.[1] : undefined
  if (id && WEB_VIDEO_ID_PATTERNS.bilibiliBvid.test(id)) params.set('bvid', id)
  else if (aid) params.set('aid', aid)
  else return { platform: WEB_VIDEO_PLATFORM_IDS.bilibili, embedUrl: null }
  const page = positiveIntParam(url, 'p')
  if (page) params.set('p', String(page))
  params.set('autoplay', '0')
  return {
    platform: WEB_VIDEO_PLATFORM_IDS.bilibili,
    embedUrl: `${WEB_VIDEO_EMBED.bilibiliPlayer}?${params.toString()}`,
  }
}

function niconicoTarget(url: URL, host: string): WebVideoTarget {
  const segments = segmentsOf(url)
  // `nico.ms/sm9`：短链的稿件号就在路径里；`www.` / `sp.nicovideo.jp/watch/sm9`。
  const id = hostMatches(host, ['nico.ms'])
    ? segments[0]
    : segments[0] === 'watch'
      ? segments[1]
      : undefined
  return {
    platform: WEB_VIDEO_PLATFORM_IDS.niconico,
    embedUrl:
      id && WEB_VIDEO_ID_PATTERNS.niconico.test(id)
        ? `${WEB_VIDEO_EMBED.niconicoPrefix}${id}`
        : null,
  }
}

/**
 * Vimeo 的稿件号只认这几个位置：`vimeo.com/123` · `vimeo.com/123/abcdef`（不公开）·
 * `vimeo.com/channels/x/123` · `vimeo.com/groups/x/videos/123` ·
 * `player.vimeo.com/video/123?h=abcdef`。
 * ⚠ ⛔「路径里第一段纯数字」：`vimeo.com/showcase/123` / `album/123` 的数字是合集号，
 *   当稿件号嵌进去就是一个打不开的播放器。
 */
function vimeoIdIndex(segments: readonly string[]): number {
  return segments.findIndex(
    (segment, index) =>
      WEB_VIDEO_ID_PATTERNS.vimeo.test(segment) &&
      (index === 0 ||
        segments[index - 1] === 'video' ||
        segments[index - 1] === 'videos' ||
        (index === 2 && segments[0] === 'channels')),
  )
}

function vimeoTarget(url: URL): WebVideoTarget {
  const segments = segmentsOf(url)
  const index = vimeoIdIndex(segments)
  const id = index >= 0 ? segments[index] : undefined
  if (!id) return { platform: WEB_VIDEO_PLATFORM_IDS.vimeo, embedUrl: null }
  const hash = url.searchParams.get('h') ?? (index === 0 ? segments[1] : null)
  const embedUrl =
    hash && WEB_VIDEO_ID_PATTERNS.vimeoHash.test(hash)
      ? `${WEB_VIDEO_EMBED.vimeoPrefix}${id}?h=${hash}`
      : `${WEB_VIDEO_EMBED.vimeoPrefix}${id}`
  return { platform: WEB_VIDEO_PLATFORM_IDS.vimeo, embedUrl }
}

/**
 * 一条视频链接 → 平台 + 官方嵌入地址。**永远返回一个值**：认不出平台是 `other`，
 * 认得出平台、认不出稿件号（频道页 / 短链 / 专栏）是那个平台 + `embedUrl: null`。
 */
export function resolveWebVideo(rawUrl: string): WebVideoTarget {
  const url = parseHttpUrl(rawUrl)
  if (!url) return OTHER
  const host = url.hostname.toLowerCase()
  if (hostMatches(host, WEB_VIDEO_PLATFORM_HOSTS.youtube))
    return youtubeTarget(url)
  if (hostMatches(host, WEB_VIDEO_PLATFORM_HOSTS.bilibili))
    return bilibiliTarget(url)
  if (hostMatches(host, WEB_VIDEO_PLATFORM_HOSTS.niconico))
    return niconicoTarget(url, host)
  if (hostMatches(host, WEB_VIDEO_PLATFORM_HOSTS.vimeo)) return vimeoTarget(url)
  return OTHER
}

/**
 * 时长 → 秒：`3:29` / `1:02:03`、ISO 8601 的 `PT1H2M3S`、或者已经是秒数。
 * 读不出来、是 0、超过一天一律 `undefined` —— ⛔ 不回落成 0（「0:00」是一句假话）。
 */
export function parseVideoDurationSeconds(
  value: string | number | null | undefined,
): number | undefined {
  const within = (seconds: number) =>
    Number.isInteger(seconds) &&
    seconds > 0 &&
    seconds <= RESEARCH_LIMITS.maxVideoDurationSeconds
      ? seconds
      : undefined
  if (typeof value === 'number') return within(Math.round(value))
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  const clock = /^(\d{1,3})(?::(\d{1,2}))(?::(\d{1,2}))?$/.exec(text)
  if (clock) {
    const parts = [clock[1], clock[2], clock[3]]
      .filter((part): part is string => part !== undefined)
      .map(Number)
    // 第一段之后每段都必须 < 60（`3:75` 不是时长）。
    if (parts.slice(1).some((part) => part >= 60)) return undefined
    return within(parts.reduce((total, part) => total * 60 + part, 0))
  }
  const iso = /^PT(?:(\d{1,3})H)?(?:(\d{1,4})M)?(?:(\d{1,5})S)?$/i.exec(text)
  if (iso && (iso[1] || iso[2] || iso[3]))
    return within(
      Number(iso[1] ?? 0) * 3600 +
        Number(iso[2] ?? 0) * 60 +
        Number(iso[3] ?? 0),
    )
  return undefined
}

/** `12:40` / `1:02:03` —— 封面右下角那枚角标，也是模型那一行里的时长。 */
export function formatVideoDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`
}
