import {
  CHARACTER_BROWSE_SOURCE_IDS,
  type CharacterVideoSource,
} from '@/constants/character-browse'
import { VIDEO_LINK_KINDS, VIDEO_LINK_PLATFORMS } from '@/constants/video-link'
import { buildYoutubeWatchUrl, classifyVideoLink } from '@/lib/video-link'

/**
 * **指定视频**（角色大项目第 ⑥ 步，owner 10-30「一起贴更好」）：出门弹框「＋添加网址」里贴的是
 * B 站 / YouTube / X 的视频链接，就当成「她先看这个」；后面可以跟一段时间（`3:00-5:00`）只看那一段。
 * 弹框和服务端共用这一份（服务端会再认一遍）。认不出 / 短链（b23.tv 拿不到稿件号）→ `null`。
 */
export interface OutingVideoLink {
  platform: CharacterVideoSource
  /** 规整过的链接：B 站 `/video/BV…`、YouTube `watch?v=`、X `/i/status/<id>`。 */
  url: string
  /** 只看这一段（秒）；缺席 = 从头 / 到尾。 */
  start?: number
  end?: number
}

const TIME = String.raw`\d{1,2}(?::\d{1,2}){1,2}`
const RANGE = new RegExp(`(${TIME})\\s*[-~～—–到至]\\s*(${TIME})`)

/** `1:02:03` / `3:05` → 秒；写坏了 → `null`。 */
function seconds(text: string): number | null {
  const parts = text.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  if (parts.slice(1).some((part) => part >= 60)) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

export function parseOutingVideoLink(raw: string): OutingVideoLink | null {
  const text = raw.trim()
  const urlText = text.match(/https?:\/\/\S+/)?.[0]
  if (!urlText) return null
  const kind = classifyVideoLink(urlText)
  let link: OutingVideoLink | null = null
  if (kind.kind === VIDEO_LINK_KINDS.youtube) {
    link = {
      platform: CHARACTER_BROWSE_SOURCE_IDS.youtube,
      url: buildYoutubeWatchUrl(kind.videoId),
    }
    // YouTube 分享链接自带的起点（`?t=90` / `&t=90s`）。
    const t = Number(urlText.match(/[?&]t=(\d+)s?/)?.[1])
    if (t > 0) link.start = t
  } else if (kind.kind === VIDEO_LINK_KINDS.platformPage && kind.id) {
    if (kind.platform === VIDEO_LINK_PLATFORMS.bilibili)
      link = {
        platform: CHARACTER_BROWSE_SOURCE_IDS.bilibili,
        url: `https://www.bilibili.com/video/${kind.id}`,
      }
    if (kind.platform === VIDEO_LINK_PLATFORMS.x)
      link = {
        platform: CHARACTER_BROWSE_SOURCE_IDS.x,
        url: `https://x.com/i/status/${kind.id}`,
      }
  }
  if (!link) return null
  const range = text.replace(urlText, ' ').match(RANGE)
  if (range) {
    const start = seconds(range[1] ?? '')
    const end = seconds(range[2] ?? '')
    if (start !== null && end !== null && end > start)
      return { ...link, start, end }
  }
  return link
}

/** 「3:00」「1:02:03」。 */
export function formatVideoTime(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** 「3:00-5:00」「3:00 起」那一段的样子；没截 → `null`。 */
export function formatVideoRange(link: {
  start?: number
  end?: number
}): string | null {
  if (link.start === undefined && link.end === undefined) return null
  return `${formatVideoTime(link.start ?? 0)}-${link.end !== undefined ? formatVideoTime(link.end) : ''}`
}
