import 'server-only'

import {
  BILIBILI_REQUEST,
  RESEARCH_LIMITS,
  RESEARCH_RECEIPT_VIAS,
  RESEARCH_SOURCE_IDS,
  RESEARCH_USER_AGENT,
  detectResearchVideoSite,
} from '@/constants/research'
import { logger } from '@/lib/logger'
import { webSearch } from '@/services/web-research.service'
import type { EvidenceItem } from '@/types/research'
import {
  evidenceId,
  evidenceTier,
  researchFetchJson,
  ResearchSourceError,
  type ConnectorResult,
} from '@/services/research/connector-runtime'

/**
 * B站连接器 —— 调研这条路**元数据 only**（已拍板边界 16）：拿标题 / UP主 / 时长 / 封面 / 链接出一张
 * 链接卡，⛔ 不碰视频内容。
 * ⚠ 例外只有文件末尾「看视频」那一节：角色出门（第 ⑥ 步，owner 10-30）开着「看视频」才取流 / 分帧。
 *
 * 🔬 两个入口的稳定性天差地别（切片 0 实测）：
 *  - `view?bvid=` **稳定**，四要素齐；
 *  - `search/type` **裸调 6 次只成 3 次**（其余 HTTP 412 风控页）。
 *
 * 所以搜索入口必须带一次退避重试，仍失败就退到 Serper `site:bilibili.com`，
 * 并在 perSource 里如实标 `via:'serper-fallback'`。**一半概率静默失败是不允许的**
 * —— 那正是「单源静默失败不允许」这条要挡的东西。
 */

const BVID_PATTERN = /BV[0-9A-Za-z]{10}/

interface BilibiliEnvelope<TData> {
  code?: number
  message?: string
  data?: TData
}

interface BilibiliViewData {
  bvid?: string
  aid?: number
  cid?: number
  title?: string
  desc?: string
  duration?: number
  pubdate?: number
  pic?: string
  owner?: { name?: string }
}

interface BilibiliSearchData {
  result?: {
    bvid?: string
    title?: string
    author?: string
    duration?: string
    pic?: string
    arcurl?: string
    pubdate?: number
    description?: string
  }[]
}

function bilibiliHeaders(): Record<string, string> {
  return { Referer: BILIBILI_REQUEST.referer }
}

/** B站也是「HTTP 200 + body 里的 code」这种表达失败的方式，跟 MediaWiki 同理。 */
function unwrap<TData>(payload: BilibiliEnvelope<TData>): TData {
  if (payload.code !== 0) {
    throw new ResearchSourceError(
      RESEARCH_SOURCE_IDS.bilibili,
      `bilibili rejected the call: code=${payload.code} ${payload.message ?? ''}`.trim(),
    )
  }
  if (!payload.data) {
    throw new ResearchSourceError(
      RESEARCH_SOURCE_IDS.bilibili,
      'bilibili returned an empty payload',
    )
  }
  return payload.data
}

function stripHighlight(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

function absoluteCover(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('//')) return `https:${url}`
  return url
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * B站搜索结果的 `duration` 是 `12:40` / `1:02:03` 这种字符串（单稿件接口给的是
 * 秒数）。⚠ 解不出来就**缺席**，⛔ 不回落成 0。
 */
function parseDurationSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parts = value.trim().split(':')
  if (parts.length < 2 || parts.length > 3) return undefined
  let seconds = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined
    seconds = seconds * 60 + Number(part)
  }
  return seconds > 0 && seconds <= RESEARCH_LIMITS.maxVideoDurationSeconds
    ? seconds
    : undefined
}

function metadataExcerpt(fields: (string | undefined)[]): string {
  return fields.filter(Boolean).join(' · ')
}

// ─── 单稿件（稳定路）────────────────────────────────────────────

async function fetchByBvid(bvid: string): Promise<EvidenceItem[]> {
  const payload = await researchFetchJson<BilibiliEnvelope<BilibiliViewData>>(
    RESEARCH_SOURCE_IDS.bilibili,
    `${BILIBILI_REQUEST.viewEndpoint}?bvid=${encodeURIComponent(bvid)}`,
    { headers: bilibiliHeaders() },
  )
  const data = unwrap(payload)
  if (!data.title) return []

  const retrievedAt = new Date().toISOString()
  const tier = evidenceTier(RESEARCH_SOURCE_IDS.bilibili)
  const url = `https://www.bilibili.com/video/${data.bvid ?? bvid}`
  const cover = absoluteCover(data.pic)
  /**
   * ⭐ **一条稿件 = 一条 `video` 证据**（56b 切片 1）。
   *
   * 🔬 改动前这里出**两条**：一条 text（元数据）+ 一条 image（封面）。两条同 URL
   * 的证据在来源卡上占两格，而它们指的是同一支视频 —— 用户读到的是「它找到了
   * 两个来源」。现在合成一条：封面进 `thumbnailUrl`、时长进 `durationSeconds`、
   * 元数据原样进 `excerpt`（模型能读的那一半一个字都没少）。
   * ⚠ 仍然**只碰元数据**：时长是接口给的秒数，⛔ 不解码任何一帧（边界 18）。
   */
  const items: EvidenceItem[] = [
    {
      kind: 'video',
      id: evidenceId(RESEARCH_SOURCE_IDS.bilibili, `view:${bvid}`),
      sourceId: RESEARCH_SOURCE_IDS.bilibili,
      sourceTier: tier,
      retrievedAt,
      title: `bilibili · ${data.title}`,
      url,
      lang: 'zh',
      videoUrl: url,
      site: 'bilibili',
      ...(data.owner?.name?.trim()
        ? { channel: data.owner.name.trim().slice(0, 120) }
        : {}),
      ...(cover ? { thumbnailUrl: cover } : {}),
      ...(typeof data.duration === 'number' &&
      data.duration > 0 &&
      data.duration <= RESEARCH_LIMITS.maxVideoDurationSeconds
        ? { durationSeconds: Math.round(data.duration) }
        : {}),
      ...(data.pubdate
        ? {
            publishedAt: new Date(data.pubdate * 1000)
              .toISOString()
              .slice(0, 10),
          }
        : {}),
      excerpt: metadataExcerpt([
        `标题：${data.title}`,
        data.owner?.name ? `UP主：${data.owner.name}` : undefined,
        typeof data.duration === 'number'
          ? `时长：${formatDuration(data.duration)}（${data.duration} 秒）`
          : undefined,
        data.pubdate
          ? `发布：${new Date(data.pubdate * 1000).toISOString().slice(0, 10)}`
          : undefined,
        data.desc?.trim()
          ? `简介：${data.desc.trim().slice(0, 200)}`
          : undefined,
      ]),
    },
  ]

  return items
}

// ─── 搜索（风控路）─────────────────────────────────────────────

async function searchOnce(keyword: string): Promise<EvidenceItem[]> {
  const payload = await researchFetchJson<BilibiliEnvelope<BilibiliSearchData>>(
    RESEARCH_SOURCE_IDS.bilibili,
    `${BILIBILI_REQUEST.searchEndpoint}?search_type=video&keyword=${encodeURIComponent(keyword)}`,
    { headers: bilibiliHeaders(), maxAttempts: 1 },
  )
  const data = unwrap(payload)
  const retrievedAt = new Date().toISOString()
  const tier = evidenceTier(RESEARCH_SOURCE_IDS.bilibili)

  return (data.result ?? [])
    .slice(0, BILIBILI_REQUEST.maxResults)
    .filter((entry) => entry.title)
    .map((entry) => {
      /**
       * ⭐ 先用 BV 号拼（2026-10-16 owner：左边那列 B站视频点不开）：`arcurl` 是 av 号的写法，
       *   新稿件的 av 号有 15–16 位，认不出就不嵌；而 Google 那一路给的是 BV 号，同一支视频两种
       *   写法还去不了重。没有 BV 号才用 `arcurl`。
       */
      const url = entry.bvid
        ? `https://www.bilibili.com/video/${entry.bvid}`
        : entry.arcurl
      const cover = absoluteCover(entry.pic)
      const excerpt = metadataExcerpt([
        `标题：${stripHighlight(entry.title ?? '')}`,
        entry.author ? `UP主：${entry.author}` : undefined,
        entry.duration ? `时长：${entry.duration}` : undefined,
        entry.description
          ? `简介：${stripHighlight(entry.description).slice(0, 160)}`
          : undefined,
      ])
      const base = {
        id: evidenceId(
          RESEARCH_SOURCE_IDS.bilibili,
          `search:${entry.bvid ?? stripHighlight(entry.title ?? '')}`,
        ),
        sourceId: RESEARCH_SOURCE_IDS.bilibili,
        sourceTier: tier,
        retrievedAt,
        title: `bilibili · ${stripHighlight(entry.title ?? '')}`,
        ...(url ? { url } : {}),
        lang: 'zh' as const,
      }
      /**
       * ⚠ **没有 URL 就退回 text**：`video` 档的 `videoUrl` 是必填，而一条点不开
       * 的「视频」在界面上就是一颗按下去没反应的播放钮。搜索结果偶尔 `arcurl`
       * 与 `bvid` 都缺，那一条仍旧是有用的元数据，⛔ 不整条丢掉。
       */
      if (!url) return { ...base, kind: 'text' as const, excerpt }
      const duration = parseDurationSeconds(entry.duration)
      const channel = stripHighlight(entry.author ?? '').slice(0, 120)
      return {
        ...base,
        kind: 'video' as const,
        videoUrl: url,
        site: 'bilibili',
        ...(channel ? { channel } : {}),
        ...(cover ? { thumbnailUrl: cover } : {}),
        ...(duration ? { durationSeconds: duration } : {}),
        excerpt,
      }
    })
}

/** Serper 退路。**如实标注**，不假装是 B站接口给的。 */
async function searchViaSerper(keyword: string): Promise<EvidenceItem[]> {
  const results = await webSearch(keyword, {
    includeDomains: [BILIBILI_REQUEST.fallbackSiteQuery],
    num: BILIBILI_REQUEST.maxResults,
  })
  const retrievedAt = new Date().toISOString()
  const tier = evidenceTier(RESEARCH_SOURCE_IDS.bilibili)
  return results.map((result, index) => {
    const base = {
      id: evidenceId(RESEARCH_SOURCE_IDS.bilibili, `serper:${index}`),
      sourceId: RESEARCH_SOURCE_IDS.bilibili,
      sourceTier: tier,
      retrievedAt,
      title: `bilibili（经网搜）· ${result.title}`,
      url: result.url,
      lang: 'zh' as const,
      excerpt: result.snippet,
    }
    /**
     * ⚠ 退路也要判一次：退到 Serper 的那一条打的是 `site:bilibili.com`，回来的
     * 既可能是播放页也可能是专栏/空间页。⛔ 不因为「源是 B站」就一律当视频。
     * ⚠ 这条路**没有封面与时长**（Serper 的网页结果不给），所以正文里那一格
     * 不画封面 —— 如实少一样，⛔ 不编。
     */
    const site = detectResearchVideoSite(result.url)
    return site
      ? { ...base, kind: 'video' as const, videoUrl: result.url, site }
      : { ...base, kind: 'text' as const }
  })
}

export async function fetchBilibiliEvidence(params: {
  query: string
}): Promise<ConnectorResult> {
  const bvid = params.query.match(BVID_PATTERN)?.[0]
  if (bvid) {
    // 稳定路：不需要退路。
    return { items: await fetchByBvid(bvid) }
  }

  try {
    return { items: await searchOnce(params.query) }
  } catch (firstError) {
    logger.info('bilibili search failed, backing off once', {
      error:
        firstError instanceof Error ? firstError.message : String(firstError),
    })
    await new Promise((resolve) =>
      setTimeout(resolve, BILIBILI_REQUEST.searchRetryDelayMs),
    )
    try {
      return { items: await searchOnce(params.query) }
    } catch (secondError) {
      logger.info('bilibili search still failing, falling back to web search', {
        error:
          secondError instanceof Error
            ? secondError.message
            : String(secondError),
      })
      const items = await searchViaSerper(params.query)
      return { items, via: RESEARCH_RECEIPT_VIAS.serperFallback }
    }
  }
}

// ─── 弹幕（角色出门逛，第 4 批）─────────────────────────────────

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 一个稿件里刷得最多的那几条弹幕（按出现次数，去重）。只给模型读个热闹，⛔ 存原文、⛔ 存发送者。
 * 拿不到（没有 cid、被风控）就是空数组。
 */
export async function fetchBilibiliDanmaku(
  bvid: string,
  limit: number,
): Promise<string[]> {
  const payload = await researchFetchJson<BilibiliEnvelope<BilibiliViewData>>(
    RESEARCH_SOURCE_IDS.bilibili,
    `${BILIBILI_REQUEST.viewEndpoint}?bvid=${encodeURIComponent(bvid)}`,
    { headers: bilibiliHeaders(), maxAttempts: 1 },
  )
  const cid = unwrap(payload).cid
  if (!cid) return []
  const response = await fetch(
    `${BILIBILI_REQUEST.danmakuEndpoint}?oid=${cid}`,
    {
      headers: { 'User-Agent': RESEARCH_USER_AGENT, ...bilibiliHeaders() },
      signal: AbortSignal.timeout(RESEARCH_LIMITS.sourceTimeoutMs),
    },
  )
  if (!response.ok) return []
  const xml = await response.text()
  const counts = new Map<string, number>()
  for (const match of xml.matchAll(/<d [^>]*>([^<]{1,60})<\/d>/g)) {
    const text = decodeXmlText(match[1] ?? '').trim()
    // 倒计时「5」「4」、单个字不算热闹。
    if ([...text].length < 2 || /^\d+$/.test(text)) continue
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text]) => text)
}

// ─── 看视频（角色出门，角色大项目第 ⑥ 步）────────────────────────

/** 一个稿件看视频要的：aid（热评）、cid（取流 / 弹幕）、时长、标题封面。 */
export interface BilibiliVideoInfo {
  bvid: string
  aid: number
  cid: number
  duration: number
  title: string
  cover: string | null
  desc: string
}

export async function fetchBilibiliVideoInfo(
  bvid: string,
): Promise<BilibiliVideoInfo | null> {
  const payload = await researchFetchJson<BilibiliEnvelope<BilibiliViewData>>(
    RESEARCH_SOURCE_IDS.bilibili,
    `${BILIBILI_REQUEST.viewEndpoint}?bvid=${encodeURIComponent(bvid)}`,
    { headers: bilibiliHeaders(), maxAttempts: 1 },
  )
  const data = unwrap(payload)
  if (!data.aid || !data.cid) return null
  return {
    bvid: data.bvid ?? bvid,
    aid: data.aid,
    cid: data.cid,
    duration: Math.max(0, Math.round(data.duration ?? 0)),
    title: data.title ?? bvid,
    cover: absoluteCover(data.pic) ?? null,
    desc: data.desc?.trim() ?? '',
  }
}

interface BilibiliPlayurlData {
  durl?: { url?: string; size?: number }[]
}

/** 360P 带声音的 mp4（不登录）。⚠ 下载要带 Referer（`bilibiliMediaHeaders`）。 */
export async function fetchBilibiliMp4(
  bvid: string,
  cid: number,
): Promise<{ url: string; size: number | null } | null> {
  const payload = await researchFetchJson<
    BilibiliEnvelope<BilibiliPlayurlData>
  >(
    RESEARCH_SOURCE_IDS.bilibili,
    `${BILIBILI_REQUEST.playurlEndpoint}?bvid=${encodeURIComponent(bvid)}&cid=${cid}&qn=16&platform=html5`,
    { headers: bilibiliHeaders(), maxAttempts: 1 },
  )
  const first = unwrap(payload).durl?.[0]
  if (!first?.url) return null
  return { url: first.url, size: first.size ?? null }
}

/** B 站图床 / 视频流认 Referer。 */
export function bilibiliMediaHeaders(): Record<string, string> {
  return { 'User-Agent': RESEARCH_USER_AGENT, ...bilibiliHeaders() }
}

interface BilibiliVideoshotData {
  img_x_len?: number
  img_y_len?: number
  img_x_size?: number
  img_y_size?: number
  image?: string[]
  index?: number[]
}

/** 预览雪碧图：几张大图、每张几行几列、每格多大、每格是第几秒。 */
export interface BilibiliFrameSheet {
  images: string[]
  columns: number
  rows: number
  width: number
  height: number
  /** 第 i 格（跨图连续编号）是第几秒。 */
  times: number[]
}

export async function fetchBilibiliFrameSheet(
  bvid: string,
): Promise<BilibiliFrameSheet | null> {
  const payload = await researchFetchJson<
    BilibiliEnvelope<BilibiliVideoshotData>
  >(
    RESEARCH_SOURCE_IDS.bilibili,
    `${BILIBILI_REQUEST.videoshotEndpoint}?bvid=${encodeURIComponent(bvid)}&index=1`,
    { headers: bilibiliHeaders(), maxAttempts: 1 },
  )
  const data = unwrap(payload)
  const images = (data.image ?? []).flatMap((url) => {
    const absolute = absoluteCover(url)
    return absolute ? [absolute] : []
  })
  if (!images.length || !data.img_x_len || !data.img_y_len) return null
  // `index` 头一个是占位的 0，后面才是每格的秒数。
  const times = (data.index ?? []).slice(1)
  return {
    images,
    columns: data.img_x_len,
    rows: data.img_y_len,
    width: data.img_x_size ?? 160,
    height: data.img_y_size ?? 90,
    times,
  }
}

interface BilibiliReplyData {
  replies?: { content?: { message?: string } }[] | null
}

/** 最热的几条评论（只喂模型，⛔ 存原文、⛔ 存发送者）。拿不到就是空数组。 */
export async function fetchBilibiliComments(
  aid: number,
  limit: number,
): Promise<string[]> {
  const payload = await researchFetchJson<BilibiliEnvelope<BilibiliReplyData>>(
    RESEARCH_SOURCE_IDS.bilibili,
    `${BILIBILI_REQUEST.replyEndpoint}?type=1&oid=${aid}&sort=1&ps=20`,
    { headers: bilibiliHeaders(), maxAttempts: 1 },
  )
  return (unwrap(payload).replies ?? [])
    .map((reply) => reply.content?.message?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((text) => [...text].length >= 2)
    .map((text) => text.slice(0, 120))
    .slice(0, limit)
}
