/**
 * **找到的东西的编号 `#n`**与**查证的短版**（搜索期第三片，附录 I §二 6 / 7、§3.3）——
 * 服务端与面板共用的那几样纯函数。
 *
 * ⭐ 模型只拿编号那一行（`#3 · 标题 · 域名 · 1920×1080 · usable as reference`），卡片的完整数据
 *   （缩略图、原图、链接、尺寸）只进面板；模型写 `#3`，服务端换回那一张、面板把那一张圈出来。
 * ⚠ `#n` 与查证的 `[n]` 是两套号：`[n]` 是证据号（正文角标），`#n` 是找到的图 / 视频。
 * 纯函数、无 IO。
 */

import {
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_WEB_FIND_LIMITS,
} from '@/constants/assistant-operator'
import {
  isWebImageSourceUsableAsInput,
  judgeWebImageSource,
  type WebImageSourceVerdict,
} from '@/constants/web-image-sources'
import {
  WEB_VIDEO_PLATFORM_IDS,
  WEB_VIDEO_PLATFORM_NAMES,
} from '@/constants/web-video'
import { formatVideoDuration } from '@/lib/web-video'
import type {
  AssistantOperatorWebImage,
  AssistantOperatorWebVideo,
} from '@/types/assistant-operator'
import {
  AssistantWebImageFindSchema,
  AssistantWebVideoFindSchema,
  type AssistantWebFind,
  type AssistantWebImageFind,
  type AssistantWebVideoFind,
} from '@/types/assistant-web-finds'

/** 工具入参里的一整个句柄：`#3` / `＃3` / `# 3`。 */
const WHOLE_HANDLE = /^\s*[#＃]\s*(\d{1,4})\s*$/

/** 模型在工具里写的 `#3` → 3；不是这个形状就 `null`。 */
export function parseWebFindHandle(
  text: string | null | undefined,
): number | null {
  const match = text ? WHOLE_HANDLE.exec(text) : null
  if (!match) return null
  const n = Number(match[1])
  return n >= 1 && n <= ASSISTANT_WEB_FIND_LIMITS.maxNumber ? n : null
}

/**
 * 正文里的 `#3`（面板把它画成一颗小胶囊）。
 * ⚠ 前后不能紧贴拉丁字母数字：`C#4`、`#3a`、`&#123;` 都不是点名；号最多 4 位。
 *   中日文紧贴着写是常态（「我觉得#3最像」），所以只排除 ASCII。
 */
export const WEB_FIND_REF_PATTERN =
  /(?<![A-Za-z0-9_&#])[#＃](\d{1,4})(?![A-Za-z0-9_])/g

/**
 * 一张找到的图**能不能当参考**（服务端每一跳重判，⛔ 不信往返带回来的结论）。
 * 判据与搜图那一刻同一张表（`judgeWebImageSource`，判站点域名）；再看一眼图片所在页的
 * 主机名 —— 两边有一边不让用就不让用。
 */
export function judgeWebImageFind(
  find: Pick<AssistantWebImageFind, 'domain' | 'pageUrl'>,
): WebImageSourceVerdict {
  const verdicts = [
    judgeWebImageSource(find.domain ?? find.pageUrl),
    ...(find.pageUrl && find.domain ? [judgeWebImageSource(find.pageUrl)] : []),
  ]
  return (
    verdicts.find((verdict) => !isWebImageSourceUsableAsInput(verdict)) ??
    verdicts[0]!
  )
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function lineTitle(title: string | undefined): string | null {
  const text = title?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const max = ASSISTANT_WEB_FIND_LIMITS.maxLineTitleChars
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** 图那一行：`#n · 标题 · 域名 · 宽×高 · usable as reference / view only`（缺哪格少哪格）。 */
export function describeWebImageFindLine(
  image: Pick<
    AssistantWebImageFind,
    'n' | 'title' | 'domain' | 'publisher' | 'pageUrl' | 'width' | 'height'
  >,
  usable: boolean,
): string {
  return [
    `#${image.n}`,
    lineTitle(image.title),
    image.domain ?? hostOf(image.pageUrl) ?? image.publisher ?? 'web',
    image.width && image.height ? `${image.width}×${image.height}` : null,
    usable ? 'usable as reference' : 'view only',
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/** 视频那一行：`#n · 标题 · 频道 · 平台 · 时长`（缺哪格少哪格）。 */
export function describeWebVideoFindLine(
  video: Pick<
    AssistantWebVideoFind,
    'n' | 'title' | 'channel' | 'platform' | 'domain' | 'durationSeconds'
  >,
): string {
  const platform =
    video.platform === WEB_VIDEO_PLATFORM_IDS.other
      ? (video.domain ?? 'web')
      : WEB_VIDEO_PLATFORM_NAMES[video.platform]
  return [
    `#${video.n}`,
    lineTitle(video.title),
    video.channel,
    platform,
    video.durationSeconds ? formatVideoDuration(video.durationSeconds) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/** 可有可无的那几个地址：不合格就不带（⛔ 因为一张缩略图把整条丢掉，那个号就认不出了）。 */
function optionalFindUrl<K extends string>(
  key: K,
  url: string | undefined,
): Partial<Record<K, string>> {
  return url &&
    AssistantWebImageFindSchema.shape.imageUrl.safeParse(url).success
    ? ({ [key]: url } as Partial<Record<K, string>>)
    : {}
}

/** 面板 / 步骤结果里那张图 → 本轮记录里搬的那一份（没编号的不算）。 */
export function webImageToFind(
  image: AssistantOperatorWebImage,
): AssistantWebImageFind | null {
  if (!image.n) return null
  const parsed = AssistantWebImageFindSchema.safeParse({
    kind: 'image',
    n: image.n,
    imageUrl: image.imageUrl,
    ...optionalFindUrl('thumbnailUrl', image.thumbnailUrl),
    ...optionalFindUrl('pageUrl', image.pageUrl),
    ...(image.domain ? { domain: image.domain } : {}),
    ...(image.publisher ? { publisher: image.publisher } : {}),
    ...(image.title ? { title: image.title } : {}),
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
  })
  return parsed.success ? parsed.data : null
}

export function webVideoToFind(
  video: AssistantOperatorWebVideo,
): AssistantWebVideoFind | null {
  if (!video.n) return null
  const parsed = AssistantWebVideoFindSchema.safeParse({
    kind: 'video',
    n: video.n,
    url: video.url,
    title: video.title,
    platform: video.platform,
    ...(video.channel ? { channel: video.channel } : {}),
    ...(video.domain ? { domain: video.domain } : {}),
    ...(video.durationSeconds
      ? { durationSeconds: video.durationSeconds }
      : {}),
  })
  return parsed.success ? parsed.data : null
}

/**
 * 上一轮的那几条 → 下一轮带去的那一份：按编号去重、只留最后 `maxCarried` 条（最近找到的
 * 最可能被说到）。
 */
export function carriedWebFinds(
  finds: readonly AssistantWebFind[],
): AssistantWebFind[] {
  const byNumber = new Map<number, AssistantWebFind>()
  for (const find of finds) byNumber.set(find.n, find)
  return [...byNumber.values()]
    .sort((a, b) => a.n - b.n)
    .slice(-ASSISTANT_WEB_FIND_LIMITS.maxCarried)
}

/* ─────────────────────────────────────────────────────────────────────────
 * 查证的短版（附录 I §二 6：「一次搜索最多 6×300 + 3×1600 字的摘要写进本轮记录，之后每一步
 * 都重发」）。紧跟着查证的那一步读整段；之后每一步只读这一份。
 * ───────────────────────────────────────────────────────────────────────── */

export interface ResearchCompactEvidence {
  cite: number
  title: string
  publisher: string
  url?: string
  snippet: string
  corroboration: number
}

/** 一句话摘要：第一段空白压平、截到 `maxCompactGistChars`。 */
export function researchGist(snippet: string): string {
  const text = snippet.replace(/\s+/g, ' ').trim()
  const max = ASSISTANT_RESEARCH_LIMITS.maxCompactGistChars
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function buildResearchCompact(input: {
  goal: string
  evidence: readonly ResearchCompactEvidence[]
  /** 结论那一句（自带联网的回答 / 摘录 / 归纳），≤ `maxConclusionChars`。 */
  summary?: string | null
}): string {
  const lines = input.evidence.map((item) =>
    [
      `  [${item.cite}] ${lineTitle(item.title) ?? item.publisher}`,
      hostOf(item.url) ?? item.publisher,
      researchGist(item.snippet),
      ...(item.corroboration > 1 ? [] : ['single source']),
    ]
      .filter(Boolean)
      .join(' · '),
  )
  const summary = input.summary?.replace(/\s+/g, ' ').trim()
  return `verify("${input.goal}") → ${input.evidence.length} source(s), shown in full on the step right after the search; one line each now:\n${lines.join('\n')}${
    summary ? `\nSummary: ${summary}` : ''
  }\nCite with the same [n]. To read one of them in full again, read "[n]".`
}
