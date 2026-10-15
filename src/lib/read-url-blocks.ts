import {
  URL_READER,
  URL_READER_BLOCK_REASONS,
  URL_READER_BLOCK_SIGNALS,
  type UrlReaderBlockReason,
} from '@/constants/web-search'

/**
 * **读网页时被站点挡住了**（2026-10-15）：判据、被挡的站记一阵、HTML 转文字。
 *
 * ⭐ 三样都是纯函数 / 进程内的表，服务端读页的三条路（Jina、MediaWiki API、直连）与查证选页
 *   共用这一份：⛔ 挑战页的字永远不当正文交出去。
 */

export type BlockedPageVerdict =
  | { blocked: true; reason: UrlReaderBlockReason; detail: string }
  | { blocked: false }

/** Jina 正文前的那几行头（`Title:` / `URL Source:` / `Warning:` …），之后是 `Markdown Content:`。 */
const JINA_HEADER_LINE =
  /^(Title|URL Source|Published Time|Warning|Number of Pages):[ \t]*(.*)$/
const JINA_CONTENT_MARKER = 'Markdown Content:'

/**
 * Jina 的输出：开头几行 `Title: …` / `URL Source: …` / `Warning: …`（中间可夹空行），然后
 * `Markdown Content:` 后面才是正文。没有这几行头（别的返回格式）= 整段都是正文。
 * ⚠ 只认**开头连着的**那几行：正文里写到「Markdown Content:」或「Warning:」的不算。
 */
export function parseJinaReaderOutput(raw: string): {
  title: string | null
  warnings: string[]
  body: string
} {
  const lines = raw.split('\n')
  let title: string | null = null
  const warnings: string[] = []
  let cut = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim()
    if (!line) continue
    if (line === JINA_CONTENT_MARKER) {
      cut = index + 1
      break
    }
    const header = JINA_HEADER_LINE.exec(line)
    if (!header) break
    cut = index + 1
    const value = (header[2] ?? '').trim()
    if (header[1] === 'Title') title = value || null
    if (header[1] === 'Warning' && value) warnings.push(value)
  }
  return { title, warnings, body: lines.slice(cut).join('\n').trim() }
}

/**
 * 这一页是不是「挡住你」的那一张（判据见 `URL_READER_BLOCK_SIGNALS` 头注）。
 * ⚠ 长文一律不判：正常文章谈到 Cloudflare / captcha / 403 很平常。
 */
export function detectBlockedPage(input: {
  /** 站点自己回的状态码（直连那一跳）。Jina 自己的状态码 ⛔ 不传：那是读者的事，不是站点的。 */
  status?: number
  title?: string | null
  body: string
  /** Jina 头里的 `Warning:` 行（目标站的状态码写在这里）。 */
  warnings?: readonly string[]
}): BlockedPageVerdict {
  const signals = URL_READER_BLOCK_SIGNALS
  if (input.status !== undefined && signals.statuses.includes(input.status))
    return {
      blocked: true,
      reason: URL_READER_BLOCK_REASONS.status,
      detail: `HTTP ${input.status}`,
    }
  for (const warning of input.warnings ?? []) {
    const status = Number(signals.jinaTargetStatus.exec(warning)?.[1])
    if (signals.statuses.includes(status))
      return {
        blocked: true,
        reason: URL_READER_BLOCK_REASONS.status,
        detail: `HTTP ${status}`,
      }
  }

  const body = input.body.trim()
  if (body.length > signals.maxBodyChars) return { blocked: false }
  const title = (input.title ?? '').toLowerCase()
  const warnings = (input.warnings ?? []).join('\n').toLowerCase()
  const lower = body.toLowerCase()
  const head = `${title}\n${warnings}\n${lower.slice(0, signals.strongMarkerHeadChars)}`
  const strong = signals.strongMarkers.find((marker) => head.includes(marker))
  if (strong)
    return {
      blocked: true,
      reason: URL_READER_BLOCK_REASONS.challenge,
      detail: strong,
    }
  if (body.length > signals.weakMarkerMaxBodyChars) return { blocked: false }
  const all = `${title}\n${warnings}\n${lower}`
  const weak = signals.weakMarkers.filter((marker) => marker.test(all))
  if (weak.length >= 2)
    return {
      blocked: true,
      reason: URL_READER_BLOCK_REASONS.challenge,
      detail: weak.map((marker) => marker.source).join(' + '),
    }
  return { blocked: false }
}

// ─── 被挡的站记一阵（进程内）────────────────────────────────────

/**
 * 一个主机最近一次被挡（谁记、怎么用见 `web-research.service` 的 `readUrlDetailed`）。
 *  · `readerOnly: false` = 整站挡：Jina 与直连都被挡。这段时间里不再碰这两条（wiki 站的 API
 *    是另一扇门，照试）；查证选页与证据排序把它往后放。
 *  · `readerOnly: true` = 只有 Jina 被挡、退路读到了：下次跳过 Jina 直接走退路，⛔ 不算「这个站
 *    被挡」。
 * ⚠ 不提前解除：到期才忘（站点放开了，最多晚 `URL_READER.blockedHostTtlMs` 才知道）。
 */
export interface ReadHostBlock {
  until: number
  reason: UrlReaderBlockReason
  detail: string
  readerOnly: boolean
}

const blockedHosts = new Map<string, ReadHostBlock>()

/** 网址或主机 → 比对用的主机名（小写、去掉 `www.`）。认不出 = `null`。 */
export function readHostOf(urlOrHost: string): string | null {
  let host: string
  try {
    host = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost
  } catch {
    return null
  }
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
  return normalized || null
}

/** 记下这个站被挡了（`URL_READER.blockedHostTtlMs` 之内有效；表满了先丢最早到期的）。 */
export function markReadHostBlocked(
  urlOrHost: string,
  block: { reason: UrlReaderBlockReason; detail: string; readerOnly: boolean },
  now: number = Date.now(),
): void {
  const host = readHostOf(urlOrHost)
  if (!host) return
  for (const [key, entry] of blockedHosts)
    if (entry.until <= now) blockedHosts.delete(key)
  if (
    !blockedHosts.has(host) &&
    blockedHosts.size >= URL_READER.maxBlockedHosts
  ) {
    const oldest = [...blockedHosts.entries()].reduce((a, b) =>
      b[1].until < a[1].until ? b : a,
    )
    blockedHosts.delete(oldest[0])
  }
  blockedHosts.set(host, { ...block, until: now + URL_READER.blockedHostTtlMs })
}

/** 这个站还记着被挡吗（过期的顺手清掉）。 */
export function readHostBlockOf(
  urlOrHost: string,
  now: number = Date.now(),
): ReadHostBlock | null {
  const host = readHostOf(urlOrHost)
  if (!host) return null
  const entry = blockedHosts.get(host)
  if (!entry) return null
  if (entry.until <= now) {
    blockedHosts.delete(host)
    return null
  }
  return entry
}

/** 整个站都读不到（不只是 Jina 被挡）—— 查证选页与证据排序把它往后放。 */
export function isReadHostBlocked(
  urlOrHost: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!urlOrHost) return false
  const entry = readHostBlockOf(urlOrHost, now)
  return entry !== null && !entry.readerOnly
}

/** 测试用：清空整张表。 */
export function resetReadHostBlocks(): void {
  blockedHosts.clear()
}

// ─── 直连读回来的 HTML → 文字 ───────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1]?.toLowerCase() === 'x'
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? whole
    },
  )
}

/** 整段丢掉的元素（连同里面的字）。 */
const DROPPED_ELEMENTS =
  /<(head|script|style|noscript|template|svg|iframe|canvas)\b/gi

/** 从 `from` 起往后找第一处匹配（`g` 正则 + `lastIndex`，只往前扫）。 */
function searchFrom(pattern: RegExp, text: string, from: number) {
  pattern.lastIndex = from
  return pattern.exec(text)
}

/**
 * 去掉注释与 `DROPPED_ELEMENTS`（连同内容）。⚠ 一路往前扫、找到的位置记着复用，⛔ 不用
 * `<x>[\s\S]*?</x>` 那种懒匹配：一页里几十万个没闭合的 `<svg` 会让它退化成平方级，而这里
 * 吃的是外站的 HTML。没闭合的那一段 = 后面全丢。
 */
function stripDroppedElements(html: string): string {
  const parts: string[] = []
  let position = 0
  let comment = html.indexOf('<!--')
  let element = searchFrom(DROPPED_ELEMENTS, html, 0)
  while (comment !== -1 || element) {
    const isComment = comment !== -1 && (!element || comment < element.index)
    const start = isComment ? comment : (element?.index ?? 0)
    parts.push(html.slice(position, start), ' ')
    let end: number
    if (isComment) {
      const close = html.indexOf('-->', start + 4)
      end = close === -1 ? -1 : close + 3
    } else {
      const close = searchFrom(
        new RegExp(`</${element?.[1] ?? ''}\\b`, 'gi'),
        html,
        start + 1,
      )
      const gt = close ? html.indexOf('>', close.index) : -1
      end = gt === -1 ? -1 : gt + 1
    }
    if (end === -1) return parts.join('')
    position = end
    if (comment !== -1 && comment < position)
      comment = html.indexOf('<!--', position)
    if (element && element.index < position)
      element = searchFrom(DROPPED_ELEMENTS, html, position)
  }
  parts.push(html.slice(position))
  return parts.join('')
}

/** `<title>` 里的字（⚠ 同上，只往前扫）。 */
function titleOf(html: string): string | null {
  const open = /<title\b[^<>]*>/i.exec(html)
  if (!open) return null
  const start = open.index + open[0].length
  const close = searchFrom(/<\/title\b/gi, html, start)
  if (!close) return null
  return (
    decodeEntities(html.slice(start, close.index).replace(/<[^<>]*>/g, ''))
      .replace(/\s+/g, ' ')
      .trim() || null
  )
}

/**
 * 一页 HTML → 标题 + 可读文字（直连那条退路用）。
 *
 * ⚠ 正则不是解析器：全仓唯一的 HTML 解析器 `jsdom` 在 devDependencies 里（同
 *   `web-image-import.service` 的取舍）。这里只要「把字抠出来、段落分开」：脚本、样式、
 *   `<head>` 整段丢，块级标签换成空行，其余标签去掉，实体解码。
 * ⚠ 每一条正则都是线性的（标签里 `[^<>]`，⛔ 不写 `[^>]+`：一串没闭合的 `<` 会让它退化成平方级）。
 */
export function htmlToReadableText(html: string): {
  title: string | null
  text: string
} {
  const text = decodeEntities(
    stripDroppedElements(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^<>]*>/gi, '\n- ')
      .replace(
        /<\/(p|div|section|article|main|li|ul|ol|h[1-6]|tr|table|blockquote|pre|header|footer|nav|aside|dd|dt|figure|figcaption)\s*>/gi,
        '\n\n',
      )
      .replace(/<[^<>]*>/g, ' '),
  )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title: titleOf(html), text }
}
