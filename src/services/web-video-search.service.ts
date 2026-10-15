import 'server-only'

import { z } from 'zod'

import {
  RESEARCH_SOURCE_IDS,
  type ResearchSourceId,
} from '@/constants/research'
import { WEB_VIDEO_SEARCH } from '@/constants/web-search'
import {
  WEB_VIDEO_PLATFORM_IDS,
  WEB_VIDEO_PLATFORM_NAMES,
  WEB_VIDEO_YOUTUBE_THUMBNAIL,
  type WebVideoPlatform,
} from '@/constants/web-video'
import { logger } from '@/lib/logger'
import { extractYoutubeVideoId } from '@/lib/video-link'
import { parseVideoDurationSeconds, resolveWebVideo } from '@/lib/web-video'
import { fetchBilibiliEvidence } from '@/services/research/bilibili.connector'
import { runConnector } from '@/services/research/connector-runtime'
import type { AssistantOperatorWebVideo } from '@/types/assistant-operator'
import type { EvidenceItem } from '@/types/research'

/**
 * 联网**找视频**（搜索期第二片，附录 I §3.2）。
 *
 * 两路召回，归并去重成一排卡片：
 *  1. Serper Google 视频（`/videos`）—— 平台付费的 `SERPER_API_KEY`，与搜图同 key 同域；
 *  2. 中文查询或点名 B站时另问 **B站连接器**（`fetchBilibiliEvidence`，它自己的接口免费）。
 *
 * ⛔ 不走所选模型的自带联网、⛔ 不借创作者别家的 key —— 这一条从头到尾只花平台那把
 *   Serper key（一次调用一个 credit），B站风控时连接器自己的 Serper 退路再花一个。
 * ⛔ 一个字节的视频都不取：这里只有元数据（标题 / 频道 / 时长 / 封面地址 / 播放页）。
 * ⚠ 与搜图同一条 best-effort 契约：任何一路失败只是少几条，⛔ 不抛（工具环上一步抛出去
 *   的表现是整轮跑到一半消失）；⛔ 不加自动重试（重试会把 credit 按步数翻倍）。
 */

// ─── Serper /videos ──────────────────────────────────────────────

/**
 * ⚠ **宽容解析**：字段名来自第三方集成页（`title` / `link` / `channel` / `source` /
 * `duration` / `imageUrl` / `date`），没有实测。每一格单独 `.catch(undefined)` ——
 * 某一格换了类型只丢那一格，⛔ 不让整条（更 ⛔ 整页）作废。
 */
const looseText = z.string().trim().min(1).optional().catch(undefined)

const SerperVideoItemSchema = z.object({
  title: looseText,
  link: looseText,
  channel: looseText,
  source: looseText,
  duration: z.union([z.string(), z.number()]).optional().catch(undefined),
  imageUrl: looseText,
  thumbnailUrl: looseText,
  thumbnail: looseText,
  date: looseText,
})

const SerperVideosResponseSchema = z.object({
  videos: z.array(z.unknown()).optional().catch(undefined),
})

type SerperVideoItem = z.infer<typeof SerperVideoItemSchema>

export function isWebVideoSearchConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY)
}

function httpUrl(raw: string | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function clampText(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '')
}

/**
 * 频道名：`channel` 优先；没有就看 `source`，但 `source` 常常只是平台名（「YouTube」）
 * 或站点名 —— 与平台角标 / 域名重复的那种 ⛔ 不当频道写。
 */
function channelOf(
  item: { channel?: string; source?: string },
  platform: WebVideoPlatform,
  host: string,
): string | undefined {
  const candidate = item.channel ?? item.source
  if (!candidate) return undefined
  const lowered = candidate.trim().toLowerCase()
  const platformName =
    platform === WEB_VIDEO_PLATFORM_IDS.other
      ? null
      : WEB_VIDEO_PLATFORM_NAMES[platform].toLowerCase()
  if (
    lowered === platformName ||
    lowered === host ||
    host.split('.').includes(lowered)
  )
    return undefined
  return clampText(candidate, WEB_VIDEO_SEARCH.maxChannelLength)
}

/**
 * 一条原始结果 → 一张卡片。没有可打开的播放页或没有标题 = 丢（一张点不开、或说不出
 * 是什么的卡片，摆出来只是噪音）。
 */
function toWebVideo(item: {
  link?: string
  title?: string
  channel?: string
  source?: string
  duration?: string | number
  durationSeconds?: number
  thumbnail?: string
  date?: string
}): AssistantOperatorWebVideo | null {
  const url = httpUrl(item.link)
  const title = item.title
    ? clampText(item.title, WEB_VIDEO_SEARCH.maxTitleLength)
    : ''
  if (!url || !title) return null
  const target = resolveWebVideo(url.href)
  // 四家都是 https；搜索结果偶尔给 http（B站的 `arcurl`），⛔ 别把明文链接递给面板。
  if (target.platform !== WEB_VIDEO_PLATFORM_IDS.other) url.protocol = 'https:'
  const host = bareHost(url)
  const youtubeId =
    target.platform === WEB_VIDEO_PLATFORM_IDS.youtube
      ? extractYoutubeVideoId(url)
      : null
  const thumbnail = httpUrl(item.thumbnail)
  const durationSeconds =
    item.durationSeconds ?? parseVideoDurationSeconds(item.duration)
  const channel = channelOf(item, target.platform, host)
  const date = item.date
    ? clampText(item.date, WEB_VIDEO_SEARCH.maxDateLength)
    : undefined
  return {
    url: url.href,
    title,
    platform: target.platform,
    ...(channel ? { channel } : {}),
    domain: host,
    ...(date ? { date } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(thumbnail
      ? { thumbnailUrl: thumbnail.href }
      : youtubeId
        ? { thumbnailUrl: WEB_VIDEO_YOUTUBE_THUMBNAIL(youtubeId) }
        : {}),
  }
}

/** 原始字段名的并集 —— 字段名没实测过，线上第一次跑完对日志收口。⛔ 不记查询、不记 key。 */
function rawKeysOf(entries: readonly unknown[]): string[] {
  const keys = new Set<string>()
  for (const entry of entries) {
    if (entry && typeof entry === 'object')
      for (const key of Object.keys(entry)) keys.add(key)
  }
  return [...keys].sort().slice(0, 40)
}

/**
 * Serper Google 视频。Best-effort：没 key / 上游挂了 / 形状不认得都返回 `[]`，⛔ 不抛。
 */
export async function serperVideoSearch(
  query: string,
  options: { num: number },
): Promise<AssistantOperatorWebVideo[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    logger.warn('webVideoSearch skipped: SERPER_API_KEY not configured')
    return []
  }
  try {
    const response = await fetch(WEB_VIDEO_SEARCH.serperEndpoint, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: options.num }),
      signal: AbortSignal.timeout(WEB_VIDEO_SEARCH.timeoutMs),
    })
    if (!response.ok)
      throw new Error(`Serper video search failed: ${response.status}`)
    const body: unknown = await response.json()
    const entries = SerperVideosResponseSchema.parse(body).videos ?? []
    logger.info('webVideoSearch.serper raw shape', {
      count: entries.length,
      keys: rawKeysOf(entries),
      topKeys: body && typeof body === 'object' ? rawKeysOf([body]) : [],
    })
    return entries.flatMap((entry) => {
      const parsed = SerperVideoItemSchema.safeParse(entry)
      if (!parsed.success) return []
      const item: SerperVideoItem = parsed.data
      const video = toWebVideo({
        ...item,
        thumbnail: item.imageUrl ?? item.thumbnailUrl ?? item.thumbnail,
      })
      return video ? [video] : []
    })
  } catch (error) {
    logger.warn('webVideoSearch failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

// ─── B站连接器 ───────────────────────────────────────────────────

/**
 * 要不要另问 B站：查询或创作者那句话里**点了 B站的名**，或者查询是**中文**
 * （有汉字、没有假名 —— 日文同样有汉字，⛔ 不当中文）。
 */
export function wantsBilibiliVideos(query: string, creatorText = ''): boolean {
  if (WEB_VIDEO_SEARCH.bilibiliIntent.test(query)) return true
  if (WEB_VIDEO_SEARCH.bilibiliIntent.test(creatorText)) return true
  return (
    WEB_VIDEO_SEARCH.hanCharacters.test(query) &&
    !WEB_VIDEO_SEARCH.kanaCharacters.test(query)
  )
}

/** 连接器的 `video` 证据 → 卡片。标题前那截「bilibili · 」是来源名，卡片上有平台角标，剥掉。 */
function fromBilibiliEvidence(
  item: EvidenceItem,
): AssistantOperatorWebVideo | null {
  if (item.kind !== 'video') return null
  return toWebVideo({
    link: item.videoUrl,
    title: item.title.replace(WEB_VIDEO_SEARCH.bilibiliTitlePrefix, ''),
    channel: item.channel,
    durationSeconds: item.durationSeconds,
    thumbnail: item.thumbnailUrl,
    date: item.publishedAt,
  })
}

// ─── 归并 ────────────────────────────────────────────────────────

/** 去重的键：能嵌就按嵌入地址（同一支视频的各种写法收成一个），否则按去掉片段与尾斜杠的地址。 */
function dedupeKey(video: AssistantOperatorWebVideo): string {
  const embed = resolveWebVideo(video.url).embedUrl
  if (embed) return embed
  const url = new URL(video.url)
  url.hash = ''
  return `${bareHost(url)}${url.pathname.replace(/\/+$/, '')}${url.search}`
}

export interface WebVideoSearchHit {
  video: AssistantOperatorWebVideo
  /** 哪一路找到的 —— 来源白 / 黑名单按它认来源组（网搜 / B站）。 */
  sourceId: ResearchSourceId
}

/**
 * 两路结果**轮转**归并（各取第一条、再各取第二条……）、按视频去重，重复的那条拿来
 * 补缺格（频道 / 时长 / 封面 / 日期），⛔ 不是「第一路全部 + 第二路全部」。
 */
export function mergeWebVideoHits(
  batches: readonly (readonly WebVideoSearchHit[])[],
  limit: number,
): WebVideoSearchHit[] {
  const merged: WebVideoSearchHit[] = []
  const byKey = new Map<string, WebVideoSearchHit>()
  const longest = Math.max(0, ...batches.map((batch) => batch.length))
  for (let index = 0; index < longest; index += 1) {
    for (const batch of batches) {
      const hit = batch[index]
      if (!hit) continue
      const key = dedupeKey(hit.video)
      const existing = byKey.get(key)
      if (existing) {
        existing.video = { ...hit.video, ...existing.video }
        continue
      }
      const copy = { ...hit, video: { ...hit.video } }
      byKey.set(key, copy)
      merged.push(copy)
    }
  }
  return merged.slice(0, limit)
}

/**
 * 一次找视频：Serper 与（需要时）B站并发，轮转归并、去重、封顶。
 *
 * ⚠ `allows` 是来源白 / 黑名单那道闸（调用方给，判据与查证同一张名单）：**先滤再去重**，
 *   被挡掉的那条不会拿自己的字段去补另一条。
 * ⚠ 点名 B站时 B站排前，否则 Google 视频排前。
 */
export async function searchWebVideos(params: {
  query: string
  limit: number
  serper: boolean
  bilibili: boolean
  bilibiliFirst?: boolean
  allows?: (url: string, sourceId: ResearchSourceId) => boolean
}): Promise<{ hits: WebVideoSearchHit[]; blocked: number }> {
  const [serper, bilibili] = await Promise.all([
    params.serper
      ? serperVideoSearch(params.query, { num: params.limit })
      : Promise.resolve([]),
    params.bilibili
      ? runConnector(RESEARCH_SOURCE_IDS.bilibili, () =>
          fetchBilibiliEvidence({ query: params.query }),
        ).then((result) =>
          result.items.flatMap((item) => {
            const video = fromBilibiliEvidence(item)
            return video ? [video] : []
          }),
        )
      : Promise.resolve([]),
  ])
  const tag = (
    videos: readonly AssistantOperatorWebVideo[],
    sourceId: ResearchSourceId,
  ): WebVideoSearchHit[] => videos.map((video) => ({ video, sourceId }))
  const serperHits = tag(serper, RESEARCH_SOURCE_IDS.webSearch)
  const bilibiliHits = tag(bilibili, RESEARCH_SOURCE_IDS.bilibili)
  const ordered = params.bilibiliFirst
    ? [bilibiliHits, serperHits]
    : [serperHits, bilibiliHits]
  const allows = params.allows
  const kept = allows
    ? ordered.map((batch) =>
        batch.filter((hit) => allows(hit.video.url, hit.sourceId)),
      )
    : ordered
  const blocked =
    ordered.reduce((total, batch) => total + batch.length, 0) -
    kept.reduce((total, batch) => total + batch.length, 0)
  return { hits: mergeWebVideoHits(kept, params.limit), blocked }
}
